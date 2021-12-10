import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface K3sAwsServerConfig {
    hostedZoneName: string,
    serverHost: string,
    spotPrice?: string,
    instanceTypes?: string[],
    ami?: string,
    keyPair: string,
    k3sInstallFlags?: string[]
    availabilityZone: string
}

export const defaultk3sServerConfig = {
    ami: "ami-0da4b2124e5ad5869", // ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-20210907 eu-west-3
    spotPrice: "0.007",
    instanceTypes: [
        "t2.small",
        "t3.small",
        "t3a.small"
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

        // Volume used to persists K3S data
        const k3sVolume = new aws.ebs.Volume(`k3sVolume-${name}`, {
            availabilityZone: k3sAwsConfig.availabilityZone,
            size: 2,
            type: 'gp3'
        });
        
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
                        Action: [
                            "ec2:AttachVolume",
                            "ec2:ModifyInstanceCreditSpecification"
                        ],
                        Resource: [
                            "arn:aws:ec2:*:010562097198:instance/*",
                            "arn:aws:ec2:*:010562097198:volume/*"
                        ]
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
        const userData = pulumi.all([hostedZone, k3sVolume.id]).apply( ([hz, volId]) => 
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

            # Attach k3s volume and initialize it
            # Follow https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-using-volumes.html
            aws ec2 attach-volume --volume-id ${volId} --instance-id $INSTANCE_ID --device /dev/sdf

            # Wait for volume to appear
            until lsblk /dev/nvme1n1; do echo "Waiting for /dev/nvme1n1..."; sleep 2; done

            # If there's no filesystem on the volume, create one
            [ "$(file -s /dev/nvme1n1)" = "/dev/nvme1n1: data" ] && mkfs -t xfs /dev/nvme1n1

            # Mount volume for k3s data
            mkdir -p /var/lib/rancher/k3s
            mount /dev/nvme1n1 /var/lib/rancher/k3s

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
            # Sometime fails because of timeout, use retry pattern
            n=0
            until [ "$n" -ge 5 ]
            do
                curl -sfL https://get.k3s.io | sh -s - ${k3sAwsConfig.k3sInstallFlags.join(' ')} && break
                n=$((n+1)) 
                sleep 1
            done`
        )
        
        const k3sSecurityGroup = new aws.ec2.SecurityGroup(`k3s-sg-${name}`, {
            ingress: [
                // SSH
                { fromPort: 22, toPort: 22, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["0.0.0.0/0"] },
                // HTTP(S)
                { fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["0.0.0.0/0"] },
                { fromPort: 443, toPort: 443, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["0.0.0.0/0"] },
                // K3S - See https://rancher.com/docs/k3s/latest/en/installation/installation-requirements/
                { fromPort: 6443, toPort: 6443, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["0.0.0.0/0"] },
                { fromPort: 8472, toPort: 8472, protocol: "udp", cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["0.0.0.0/0"] },
                { fromPort: 10250, toPort: 10250, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["0.0.0.0/0"] },
                { fromPort: 2379, toPort: 2380, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"], ipv6CidrBlocks: ["0.0.0.0/0"] },
            ],
            egress: [{
                fromPort: 0,
                toPort: 0,
                protocol: "-1",
                cidrBlocks: ["0.0.0.0/0"],
                ipv6CidrBlocks: ["::/0"],
            }],
            tags: {
                Name: `${name}`,
            },
        });

        // Request a Spot fleet
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
                    availabilityZone: k3sAwsConfig.availabilityZone,
                    vpcSecurityGroupIds: [ k3sSecurityGroup.id ],
                    tags: {
                        "Name": name
                }
                }
            )),
            tags: {
                "Name": name
            }
        });
    }
}
