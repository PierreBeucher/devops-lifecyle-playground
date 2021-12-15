import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws"
import * as yaml from "js-yaml"
import * as fs from "fs"
import * as deepmerge from "deepmerge-ts"

const traefikNamespace = new k8s.core.v1.Namespace("traefik-namespace", {
  metadata: {
      name: "traefik"
  }
});

const traefikValues = yaml.load(fs.readFileSync("helm/values-traefik.yml", "utf-8")) as JSON

const release = new k8s.helm.v3.Release("traefik-helm", {
  name: "traefik",
  chart: "traefik",
  version: "10.3.6",
  namespace: traefikNamespace.metadata.name,
  repositoryOpts:{
      repo: "https://helm.traefik.io/traefik",
  },
  values: traefikValues,
}, {  
  dependsOn: [traefikNamespace]
})

// AWS access to manage DNS challange with route53
// user is managed by infra 
const awsCreds = new aws.iam.AccessKey("awsAccessKey", {
  user: "certManagerIAMUser"
})

const certManagerNamespace = new k8s.core.v1.Namespace("cert-manager-namespace", {
  metadata: {
      name: "cert-manager"
  }
});


const certManagerValues = yaml.load(fs.readFileSync("helm/values-certmanager.yml", "utf-8")) as JSON

const certManagerChart =  new k8s.helm.v3.Release("cert-manager-chart", {
  name: "cert-manager",
  chart: "cert-manager",
  version: "1.5.3",
  namespace: certManagerNamespace.metadata.name,
  repositoryOpts:{
      repo: "https://charts.jetstack.io",
  },
  values: certManagerValues
}, { 
  dependsOn: [certManagerNamespace]
})

// Secret holding AWS secret key to be used by ClusterIssuer to manage ACME DNS challenge with Route53
const certManagerAwsSecret = new k8s.core.v1.Secret("certManagerAwsSecret", {
  metadata: {
    name: "cert-manager-aws-secret",
    namespace: certManagerNamespace.metadata.name
  },
  stringData: {
    "secret-access-key": awsCreds.secret
  }
}, {
  dependsOn: [certManagerNamespace, awsCreds]
})

// ClusterIssuer is a CRD managed by Cert Manager chart
// Manages certificate generation
// solver defines how certificate are verified 
// use DNS challenge with Route53 and IAM credentials stored as secret
const clusterIssuer = new k8s.apiextensions.CustomResource("certManagerClusterIssuer", {
    "apiVersion": "cert-manager.io/v1",
    "kind": "ClusterIssuer",
    "metadata": {
        "name": "cert-manager-acme-issuer",
        "namespace": certManagerNamespace.metadata.name
    },
    "spec": {
        "acme": {
            "email": "pierre@crafteo.io",
            "privateKeySecretRef": {
                "name": "cert-manager-acme-private-key"
            },
            "server": "https://acme-staging-v02.api.letsencrypt.org/directory",
            "solvers": [
                {
                    "dns01": {
                        "route53": {
                            "accessKeyID": awsCreds.id,
                            "region": aws.getRegion().then(r => r.name),
                            "secretAccessKeySecretRef": {
                                "key": "secret-access-key",
                                "name": "cert-manager-aws-secret"
                            }
                        }
                    }
                }
            ]
        }
    }
}, {
  // Cert Manager defined ClusterIssuer CRD
  // required by our Kustomization
  dependsOn: [certManagerChart, certManagerAwsSecret, awsCreds]
})
