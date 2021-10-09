import * as k3s from "./k3s"
import * as aws from "@pulumi/aws"

const keyPair = "devops-lifecycle-playground"
const hostedZoneName = "devops.crafteo.io."
const token = "Very123SecretToken"

// server init must only be done once
// create a dummy resource ClusterInitDone 
// Traefik is disabled to install our own with custom config
const k3sServer1 = new k3s.K3sAwsServer("k3sServer-1", {
  keyPair: keyPair,
  hostedZoneName: hostedZoneName,
  serverHost: "k3s-1.devops.crafteo.io",
  availabilityZone: "eu-west-3a",
  k3sInstallFlags: [
    "server", "--cluster-init",
    "--token", token,
    "--write-kubeconfig-mode", "644",
    "--disable", "traefik"
  ]
})

const k3sServer2 = new k3s.K3sAwsServer("k3sServer-2", {
  keyPair: keyPair,
  hostedZoneName: hostedZoneName,
  serverHost: "k3s-2.devops.crafteo.io",
  availabilityZone: "eu-west-3b",
  k3sInstallFlags: [
    "server",
    "--server", "https://k3s-1.devops.crafteo.io:6443",
    "--token", token,
    "--write-kubeconfig-mode", "644",
    "--disable", "traefik"
  ]
})

const k3sServer3 = new k3s.K3sAwsServer("k3sServer-3", {
  keyPair: keyPair,
  hostedZoneName: hostedZoneName,
  serverHost: "k3s-3.devops.crafteo.io",
  availabilityZone: "eu-west-3c",
  k3sInstallFlags: [
    "server",
    "--server", "https://k3s-1.devops.crafteo.io:6443",
    "--token", token,
    "--write-kubeconfig-mode", "644",
    "--disable", "traefik"
  ]
})

// IAM user and policy which will be used by Cert Manager for ACME DNS challenge
const certManagerIAMUser = new aws.iam.User("certManagerIAMUser", {
  name: "certManagerIAMUser"
})

const certManagerIAMPolicy = new aws.iam.Policy("certManagerIAMPolicy", {
  description: "Allow access to Route53 for Cert Manager ACME challenges",
  policy: aws.route53.getZone({ name: hostedZoneName }).then(hz => 
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          "Effect": "Allow",
          "Action": "route53:GetChange",
          "Resource": "arn:aws:route53:::change/*"
        },
        {
          "Effect": "Allow",
          "Action": [
            "route53:ChangeResourceRecordSets",
            "route53:ListResourceRecordSets"
          ],
          "Resource": hz.arn
        },
        {
          "Effect": "Allow",
          "Action": "route53:ListHostedZonesByName",
          "Resource": "*"
        }
      ]
    })
  )
})

const test_attach = new aws.iam.PolicyAttachment("certManagerIAMPolicyAttach", {
  users: [certManagerIAMUser.name],
  policyArn: certManagerIAMPolicy.arn,
})