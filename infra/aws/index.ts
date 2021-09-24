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
const hostedZoneName = "devops.crafteo.io"
const hostedZoneId = "Z022447923VAXAUFPW2F5"

// Role and policies allowing EC2 instances to update Route53 record to self-register DNS record with their IPs
const k3sIAMPolicy = new aws.iam.Policy("k3sIAMPolicy", {policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
        {
            Sid: "VisualEditor0",
            Effect: "Allow",
            Action: [
                "route53:GetHostedZone",
                "route53:ChangeResourceRecordSets",
                "route53:ListResourceRecordSets"
            ],
            Resource: `arn:aws:route53:::hostedzone/${hostedZoneId}`
        }
    ]
})});

const k3sInstanceRole = new aws.iam.Role("k3sEC2InstanceRole", {
  assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [{
          Action: "sts:AssumeRole",
          Effect: "Allow",
          Sid: "",
          Principal: {
              Service: "ec2.amazonaws.com",
          },
      }],
  }),
  managedPolicyArns: [
    k3sIAMPolicy.arn
  ]
});

const k3sInstanceProfile = new aws.iam.InstanceProfile("k3sInstanceProfile", {role: k3sInstanceRole.name});

// userdata script whch will create record for out instance on startup
const userData = `#!/bin/sh

apt-get update
apt-get install unzip

# Enable swap
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Install aws cli
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install

# Create a DNS record using instance IP
export INSTANCE_IP=$(curl http://169.254.169.254/latest/meta-data/public-ipv4)
echo '
{
    "Changes": [
        {
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": "k3s.${hostedZoneName}",
                "Type": "A",
                "TTL": 30,
                "ResourceRecords": [
                    {
                        "Value": "'$INSTANCE_IP'"
                    }
                ]
            }
        }
    ]
}
' > /tmp/change-batch.json

# Self-register instance IP in Hosted Zone record
aws route53 change-resource-record-sets --hosted-zone-id ${hostedZoneId} --change-batch file:///tmp/change-batch.json
`

// Request a Spot fleet
const k3sSpotFleet = new aws.ec2.SpotFleetRequest("k3sSpotFleet", {
  iamFleetRole: "arn:aws:iam::010562097198:role/aws-ec2-spot-fleet-tagging-role",
  targetCapacity: 1,
  allocationStrategy: "lowestPrice",
  spotPrice: spotPrice,
  waitForFulfillment: true,
  launchSpecifications: instanceTypes.map(instanceType => (
      {
          instanceType: instanceType,
          ami: ami,
          spotPrice: spotPrice,
          keyName: keyPair,
          iamInstanceProfile: k3sInstanceProfile.name,
          userData: userData
      }
  ))
});
