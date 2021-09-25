import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface K3sAwsServerConfig {
    hostedZoneName: string,
    serverHost: string,
    spotPrice?: string,
    instanceTypes?: string[],
    ami?: string,
    keyPair?: string,
    k3sInstallFlags?: string[]
}

export const defaultk3sServerConfig = {
    ami: "ami-0da4b2124e5ad5869", // ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-20210907 eu-west-3
    spotPrice: "0.005",
    keyPair: "devops-lifecycle-playground",
    instanceTypes: [
        "t2.micro",
        "t3.micro",
        "t3a.micro"
    ],
    hostedZoneName: "",
    serverHost: "",
    k3sInstallFlags: []
};

export class K3sAwsServer extends pulumi.ComponentResource {

    constructor(name : string, userConfig : K3sAwsServerConfig, opts? : pulumi.ComponentResourceOptions) {
        super("crafteo:K3s", name, userConfig, opts);

        const k3sAwsConfig = {
            ...defaultk3sServerConfig,
            ...userConfig
        }

        console.log(`Config: ${k3sAwsConfig}`)
        
        const hostedZone = aws.route53.getZone({ name: k3sAwsConfig.hostedZoneName })

        // Role and policies allowing EC2 instances to update Route53 record to self-register DNS record with their IPs
        const k3sIAMPolicy = new aws.iam.Policy(`k3sPolicy-${name}`, {
            policy: hostedZone.then(hz => JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Sid: "Route53Access",
                        Effect: "Allow",
                        Action: [
                            "route53:GetHostedZone",
                            "route53:ChangeResourceRecordSets",
                            "route53:ListResourceRecordSets"
                        ],
                        Resource: `arn:aws:route53:::hostedzone/${hz.id}`
                    },
                    {
                        Sid: "EC2Access",
                        Effect: "Allow",
                        Action: "ec2:ModifyInstanceCreditSpecification",
                        Resource: "arn:aws:ec2:*:010562097198:instance/*"
                    },
                ]
            }))
        })

        const k3sInstanceRole = new aws.iam.Role(`k3sInstanceRole-${name}`, {
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
        const k3sInstanceProfile = new aws.iam.InstanceProfile(`k3sInstanceProfile-${name}`, {role: k3sInstanceRole.name});

        // userdata script whch will create record for out instance on startup
        const userData = hostedZone.then(hz => 
            `#!/bin/sh
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

            # Retrieve instance ID and update credit specification to standard to avoid surcost
            # See https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-performance-instances-unlimited-mode-concepts.html#unlimited-mode-surplus-credits
            export INSTANCE_ID=$(curl http://169.254.169.254/latest/meta-data/instance-id)
            aws ec2 modify-instance-credit-specification --instance-credit-specifications  "InstanceId=$INSTANCE_ID,CpuCredits=standard"

            # Create a DNS record using instance IP
            export INSTANCE_PUBLIC_IP=$(curl http://169.254.169.254/latest/meta-data/public-ipv4)
            echo '
            {
                "Changes": [
                    {
                        "Action": "UPSERT",
                        "ResourceRecordSet": {
                            "Name": "${k3sAwsConfig.serverHost}",
                            "Type": "A",
                            "TTL": 30,
                            "ResourceRecords": [
                                {
                                    "Value": "'$INSTANCE_PUBLIC_IP'"
                                }
                            ]
                        }
                    }
                ]
            }
            ' > /tmp/change-batch.json

            # Self-register instance IP in Hosted Zone record
            aws route53 change-resource-record-sets --hosted-zone-id ${hz.id} --change-batch file:///tmp/change-batch.json

            # Install k3s with provided flags
            curl -sfL https://get.k3s.io | sh -s - ${k3sAwsConfig.k3sInstallFlags.join(' ')}`
        )

        // Request a Spot fleet on all available availability zones
        const availableZones = aws.getAvailabilityZones({
            state: "available",
        });

        const k3sSpotFleet = new aws.ec2.SpotFleetRequest(`k3sSpotFleet-${name}`, {
            iamFleetRole: "arn:aws:iam::010562097198:role/aws-ec2-spot-fleet-tagging-role",
            targetCapacity: 1,
            allocationStrategy: "lowestPrice",
            spotPrice: k3sAwsConfig.spotPrice,
            terminateInstancesWithExpiration: true,
            instanceInterruptionBehaviour: 'stop',
            launchSpecifications: k3sAwsConfig.instanceTypes.map(instanceType => (
                {
                    instanceType: instanceType,
                    ami: k3sAwsConfig.ami,
                    spotPrice: k3sAwsConfig.spotPrice,
                    keyName: k3sAwsConfig.keyPair,
                    iamInstanceProfile: k3sInstanceProfile.name,
                    userData: userData,
                    availabilityZone: availableZones.then(zones => zones.names.join(","))
                }
            ))
        });
    }
}
