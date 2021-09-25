import * as k3s from "./k3s"

const keyPair = "devops-lifecycle-playground"
const hostedZoneName = "devops.crafteo.io."
const token = "Very123SecretToken"

// server init must only be done once
// create a dummy resource ClusterInitDone 
const k3sServer1 = new k3s.K3sAwsServer("k3sServer-1", {
  keyPair: keyPair,
  hostedZoneName: hostedZoneName,
  serverHost: "k3s-1.devops.crafteo.io",
  k3sInstallFlags: [
    "server", "--cluster-init",
    "--token", token,
    "--write-kubeconfig-mode", "644",
  ]
})

const k3sServer2 = new k3s.K3sAwsServer("k3sServer-2", {
  keyPair: keyPair,
  hostedZoneName: hostedZoneName,
  serverHost: "k3s-2.devops.crafteo.io",
  k3sInstallFlags: [
    "server",
    "--server", "https://k3s-1.devops.crafteo.io:6443",
    "--token", token,
    "--write-kubeconfig-mode", "644",
  ]
})

const k3sServer3 = new k3s.K3sAwsServer("k3sServer-3", {
  keyPair: keyPair,
  hostedZoneName: hostedZoneName,
  serverHost: "k3s-3.devops.crafteo.io",
  k3sInstallFlags: [
    "server",
    "--server", "https://k3s-1.devops.crafteo.io:6443",
    "--token", token,
    "--write-kubeconfig-mode", "644",
  ]
})
