import * as k3s from "./k3s"
import * as aws from "@pulumi/aws"
import * as pulumi from "@pulumi/pulumi"

// load config
const config = new pulumi.Config();
const keyPair = config.require("sshKeyPair")
const hostedZoneName = config.require("hostedZoneName")
const token = config.require("k3sSecretToken")
const az = config.require("availabilityZone")

// use Hosted Zone name to retrieve related FQDN
// Hosted Zone name may have a trailing dot, remove it first
let k3sFqdn
if (hostedZoneName[hostedZoneName.length-1] === ".")
  k3sFqdn = hostedZoneName.slice(0,-1)
else
  k3sFqdn = hostedZoneName

// server init must only be done once
// create a dummy resource ClusterInitDone 
// Traefik is disabled to install our own with custom config
const k3sServer1 = new k3s.K3sAwsServer("k3sServer-1", {
  keyPair: keyPair,
  hostedZoneName: hostedZoneName,
  serverHost: `k3s-1.${k3sFqdn}`,
  availabilityZone: az,
  k3sInstallFlags: [
    "server", "--cluster-init",
    "--token", `'${token}'`, // wrap token in single quotes as it may contain special characters
    "--write-kubeconfig-mode", "644",
    "--disable", "traefik"
  ]
})

const k3sServer2 = new k3s.K3sAwsServer("k3sServer-2", {
  keyPair: keyPair,
  hostedZoneName: hostedZoneName,
  serverHost: `k3s-2.${k3sFqdn}`,
  availabilityZone: "eu-west-3b",
  k3sInstallFlags: [
    "server",
    "--server", `https://k3s-1.${k3sFqdn}:6443`,
    "--token", `'${token}'`, // wrap token in single quotes as it may contain special characters
    "--write-kubeconfig-mode", "644",
    "--disable", "traefik"
  ]
})

const k3sServer3 = new k3s.K3sAwsServer("k3sServer-3", {
  keyPair: keyPair,
  hostedZoneName: hostedZoneName,
  serverHost: `k3s-3.${k3sFqdn}`,
  availabilityZone: "eu-west-3c",
  k3sInstallFlags: [
    "server",
    "--server", `https://k3s-1.${k3sFqdn}:6443`,
    "--token", `'${token}'`, // wrap token in single quotes as it may contain special characters
    "--write-kubeconfig-mode", "644",
    "--disable", "traefik"
  ]
})

// IAM user and policy which will be used by Cert Manager for ACME DNS challenge
const certManagerIAMUser = new aws.iam.User("certManagerIAMUser", {
  name: "certManagerIAMUser",
  forceDestroy: true
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