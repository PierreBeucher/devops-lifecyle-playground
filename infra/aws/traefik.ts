import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export interface TraefikConfig {
}

export const defaultTraefikConfig = {
};

export class Traefik extends pulumi.ComponentResource {

  constructor(name : string, userConfig : TraefikConfig, opts? : pulumi.ComponentResourceOptions) {
      super("crafteo:K3s", name, userConfig, opts);
  
  const traefikNamespace = new k8s.core.v1.Namespace("traefik-namespace", {
    metadata: {
        name: "traefik2"
    }
  });

  const release = new k8s.helm.v3.Release("traefik-helm", {
    name: "traefik",
    chart: "traefik",
    version: "10.3.6",
    namespace: "traefik2",
    repositoryOpts:{
        repo: "https://helm.traefik.io/traefik",
    },
    values: {}
    // values: {
    //     controller: {
    //         metrics: {
    //             enabled: true,
    //         }
    //     }
    // },
  }, {  
    dependsOn: [traefikNamespace]
  })

  const certManagerNamespace = new k8s.core.v1.Namespace("cert-manager-namespace", {
    metadata: {
        name: "cert-manager2"
    }
  });
  
  const certManagerChart =  new k8s.helm.v3.Release("cert-manager-chart", {
    chart: "cert-manager",
    version: "1.5.3",
    namespace: "cert-manager2",
    repositoryOpts:{
        repo: "https://charts.jetstack.io",
    },
    values: {
      installCRDs: true
    }
  }, { 
    dependsOn: [certManagerNamespace]
  })

  }
}
