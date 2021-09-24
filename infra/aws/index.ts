import * as k3s from "./k3s"

const keyPair = "devops-lifecycle-playground"
const hostedZoneName = "devops.crafteo.io."

const k3sServer = new k3s.K3sAwsServer("k3sServer", {
  keyPair: "devops-lifecycle-playground",
  hostedZoneName: "devops.crafteo.io.",
  serverHost: "k3s.devops.crafteo.io"
})
