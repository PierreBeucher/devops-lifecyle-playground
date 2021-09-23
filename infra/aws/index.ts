import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Deploy infra on EC2
// ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-20210907 eu-west-3
const ami = "ami-0da4b2124e5ad5869"
const spotPrice = "0.005"
const keyPair = "devops-lifecycle-playground"
const instanceTypes = [
  "t2.micro",
  "t3.micro",
  "t3a.micro"
]

// Request a Spot fleet
const k3sSpotFleet = new aws.ec2.SpotFleetRequest("k3sSpotFleet", {
  iamFleetRole: "arn:aws:iam::010562097198:role/aws-ec2-spot-fleet-tagging-role",
  targetCapacity: 1,
  allocationStrategy: "lowestPrice",
  spotPrice: spotPrice,
  launchSpecifications: instanceTypes.map(instanceType => (
      {
          instanceType: instanceType,
          ami: ami,
          spotPrice: spotPrice,
          keyName: keyPair
      }
  ))
});