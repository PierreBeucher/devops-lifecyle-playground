import * as k8s from "@pulumi/kubernetes";
import * as aws from "@pulumi/aws"
import * as yaml from "js-yaml"
import * as fs from "fs"
import * as deepmerge from "deepmerge-ts"

// Datadog
const datadogNamespace = new k8s.core.v1.Namespace("datadog-namespace", {
  metadata: {
      name: "datadog"
  }
});

const datadogValues = yaml.load(fs.readFileSync("helm/values-datadog.yml", "utf-8")) as JSON
const datadogSecrets = yaml.load(fs.readFileSync("helm/secrets-datadog.yml", "utf-8")) as JSON

const datadogChart =  new k8s.helm.v3.Release("datadog-chart", {
  name: "datadog",
  chart: "datadog",
  namespace: datadogNamespace.metadata.name,
  repositoryOpts:{
      repo: "https://helm.datadoghq.com",
  },
  values: deepmerge.deepmerge(datadogValues, datadogSecrets)
}, { 
  dependsOn: [datadogNamespace]
})