
"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const awsx = require("@pulumi/awsx");
const fs = require('fs');
const yaml = require('js-yaml');
const route53 = require("@pulumi/aws/route53");



let NameOfStack = pulumi.getStack();
let FileName = `Pulumi.${NameOfStack}.yaml`;
const configFile = yaml.load(fs.readFileSync(FileName, 'utf8'));

// const current = aws.getRegion({});


const my_VPC = new aws.ec2.Vpc(`${configFile.vpcName}`,
    {
        cidrBlock: configFile.baseCIDRBlock,
        tags: {
            Name: configFile.vpcName
        }
    });

const my_ig = new aws.ec2.InternetGateway(`${configFile.igName}`, {
    tags: {
        Name: configFile.igName

    }
});

const vpc_ig_attacher = new aws.ec2.InternetGatewayAttachment("vpc_ig_attacher", {
    vpcId: my_VPC.id,
    internetGatewayId: my_ig.id,
    tags: {
        Name: "VPC_IGW_Attacher"
    }
});
let counter = 0;
//function for creating a subnet- private or public
const CreateSubnets = (vpc, type, noOfSubnets) => {
    const OctetsGiven = configFile.subnetCIDR.split('.');
    let midOctet = parseInt(OctetsGiven[2]);
    let Subnets = [];
    for (let i = 1; i < noOfSubnets + 1; i++) {
        let tempSubnet = new aws.ec2.Subnet(`${type}-Subnet-${i}`, {
            vpcId: vpc.id,
            cidrBlock: `${OctetsGiven[0]}.${OctetsGiven[1]}.${midOctet + counter++}.${OctetsGiven[3]}/${configFile.subnetMask}`,
            availabilityZone: `${configFile.availabilityZone}${String.fromCharCode(96 + i)}`,
            tags: {
                Name: `${type}-Subnet-${i}`
            }
        });
        Subnets.push(tempSubnet);
    }
    return Subnets;
}

//Creating public and Private Subnets
const publicSubnets = CreateSubnets(my_VPC, 'public', configFile.numOfPubSubnets);
const privateSubnets = CreateSubnets(my_VPC, 'private', configFile.numOfPriSubnets);




const lbSecGrp = new aws.ec2.SecurityGroup("sgLB", {
    vpcId: my_VPC.id,
    name: "lb-ec2",
    description: "Load Balancer Security Group",
    ingress: [
        // { protocol: "tcp", fromPort: 80, toPort: 80, 
        // cidrBlocks: ["0.0.0.0/0"]
    // },
        { protocol: "tcp", fromPort: 443, toPort: 443, 
        cidrBlocks: ["0.0.0.0/0"]
     }
    ],
    egress: [
        { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }
    ],
    tags: {
        Name: "load-balancer-sg",
    },
});



    
//creating security groups for EC2 instances - application 
const securityGroup = new aws.ec2.SecurityGroup("security-group", {
    name: "My_ec2",
    vpcId: my_VPC.id,
    description: " EC2 Security Group",
    ingress: [
        // {
        //     cidrBlocks: ["0.0.0.0/0"],
        //     protocol: "tcp",
        //     fromPort: 80,
        //     toPort: 80
        // },
        // {
        //     ipv6CidrBlocks: ["::/0"],
        //     protocol: "tcp",
        //     fromPort: 80,
        //     toPort: 80
        // },
        // {
        //     cidrBlocks: ["0.0.0.0/0"],
        //     protocol: "tcp",
        //     fromPort: 443,
        //     toPort: 443
        // },
        // {
        //     ipv6CidrBlocks: ["::/0"],
        //     protocol: "tcp",
        //     fromPort: 443,
        //     toPort: 443
        // },
        {
            securityGroups: [lbSecGrp.id],
            // cidrBlocks: ["0.0.0.0/0"],
            protocol: "tcp",
            fromPort: 22,
            toPort: 22
        },
        {
            securityGroups: [lbSecGrp.id],
            // cidrBlocks: ["0.0.0.0/0"],
            protocol: "tcp",
            fromPort: 8080,
            toPort: 8080
        }
    ],
    egress: [
        {
            cidrBlocks: ["0.0.0.0/0"],
            fromPort: 0,
            toPort: 0,
            protocol: "-1"
        }
    ],
    tags: {
        Name: "My_ec2"
    }
});

//Creating SG for RDS, this takes the SG of the above EC2 to allow the traffic
const dbSecGrp = new aws.ec2.SecurityGroup("sgRds", {
    vpcId: my_VPC.id,
    name: "rds-ec2-1",
    description: "Security Group of Database",
    ingress: [
        { protocol: "tcp", fromPort: 3306, toPort: 3306, securityGroups: [securityGroup.id] },
    ],
    tags: {
        Name: "rds-ec2-1",
    },
});

// Parameter group for RDS
const rdsParameterGroup = new aws.rds.ParameterGroup("pg", {
    family: configFile.rdsFamily,
    parameters: [
        {
            name: "character_set_server",
            value: "utf8"
        },
        {
            name: "character_set_client",
            value: "utf8"
        }
    ],
    description: "RDS parameter group",
});

//Create an RDS Subnet Group
const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnet-group", {
    subnetIds: [privateSubnets[0].id,
    privateSubnets[1].id]
});


//Create a new RDS instance
const rdsInstance = new aws.rds.Instance("rds-instance", {
    engine: configFile.engine,
    engineVersion: configFile.engineVersion,
    instanceClass: configFile.instanceClass,
    allocatedStorage: configFile.allocatedStorage,
    dbName: configFile.dbName,
    username: configFile.username,
    password: configFile.password,
    parameterGroupName: rdsParameterGroup.name,
    vpcSecurityGroupIds: [dbSecGrp.id],
    skipFinalSnapshot: true,
    dbSubnetGroupName: dbSubnetGroup.name,
    publiclyAccessible: false,
    multiAz: false,
    identifier: configFile.identifier, // name of the rds Instance
});



    //create SNS topic
    const snsTopic = new aws.sns.Topic("snsTopicAmi", {});

    //lamabda role
    const lambdaRole = new aws.iam.Role("lambdaRole", {
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Action: "sts:AssumeRole",
                Principal: {
                    Service: "lambda.amazonaws.com",
                },
                Effect: "Allow",
                Sid: "",
            }],
        }),
    });

    new aws.iam.RolePolicyAttachment("lambdaRolePolicyAttachment", {
        role: lambdaRole.name,
        policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    });

    const secretsManagerPolicy = new aws.iam.Policy("secretsManagerPolicy", {
        policy: {
            Version: "2012-10-17",
            Statement: [{
                Action: "secretsmanager:*", // Use the wildcard to allow any action
                Effect: "Allow",
                Resource: "*", // Use the wildcard to allow access to any resource
            }],
        },
    });

    new aws.iam.RolePolicyAttachment("lambdaRolePolicyAttachmentAWSSecretsManager", {
        role: lambdaRole.name,
        policyArn: secretsManagerPolicy.arn,
    });


    // Create DynamoDB table
    const dynamoDB = new aws.dynamodb.Table("emailtrack", {
        name: "emailtrack",
        attributes: [
            { name: "id", type: "S" },
        ],
        hashKey: "id",
        billingMode: "PAY_PER_REQUEST",
    });

    const dynamoDBFullAccessPolicy = new aws.iam.Policy("dynamoDBFullAccessPolicy", {
        policy: {
            Version: "2012-10-17",
            Statement: [{
                Action: [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem",
                    "dynamodb:Scan",
                    "dynamodb:Query",
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem"
                ],
                Resource: dynamoDB.arn, // Replace with your DynamoDB table ARN if possible
                Effect: "Allow"
            }]
        }
    });

    const dynamoDBFullAccessPolicyAttachment = new aws.iam.PolicyAttachment("dynamoDBFullAccessPolicyAttachment", {
        roles: [lambdaRole],
        policyArn: dynamoDBFullAccessPolicy.arn,
    });
    //



    
// need to uncomment





///
//
    const lambdaFunction = new aws.lambda.Function("lambdaFunction", {
        code: new pulumi.asset.AssetArchive({
            ".": new pulumi.asset.FileArchive("C:/Users/sangr/Downloads/index.zip"),
        }),
        handler: "index.handler",
        role: lambdaRole.arn,
        runtime: "nodejs18.x",
        environment: {
            // Add environment variables for GCP access keys or configurations
            variables: {
                // "GCP_SERVICE_ACCOUNT_KEY": serviceAccountKey.privateKey, // service aacount created private key to Lambda
                // "GCP_PROJECT_ID": gcp.config.project, // GCP Project ID 
                // "GOOGLE_STORAGE_BUCKET": bucket.url,
                // "GOOGLE_STORAGE_BUCKET_NAME": bucket.name,
                "DYNAMODB_TABLE_NAME": dynamoDB.name,
                "MAILGUN_API_KEY": configFile.mailgunapikey,
                "DOMAIN": configFile.domainName,
                // "GCP_SECRET_KEY": gcpSecretKeyVersion.arn,
            }
        },
    });

    new aws.lambda.Permission("lambdaPermission", {
        action: "lambda:InvokeFunction",
        function: lambdaFunction.name,
        principal: "sns.amazonaws.com",
        sourceArn: snsTopic.arn,
    });

    new aws.sns.TopicSubscription("snsTopicSubscription_lambda", {
        endpoint: lambdaFunction.arn,
        protocol: "lambda",
        topic: snsTopic.arn,
    });

   // Grant Lambda permissions to access the DynamoDB table
   const tableGrant = new aws.lambda.Permission("tableGrant", {
    action: "lambda:InvokeFunction",
    function: lambdaFunction.name,
    principal: "dynamodb.amazonaws.com",
    sourceArn: dynamoDB.arn,
});




 // Create an IAM role
 const role = new aws.iam.Role("role", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Action: "sts:AssumeRole",
                Principal: {
                    Service: "ec2.amazonaws.com"
                },
                Effect: "Allow",
                Sid: ""
            }
        ]
    })
});

    // Attach CloudWatchAgentServerPolicy policy to IAM role
    new aws.iam.RolePolicyAttachment("rolePolicyAttachment", {
        role: role.name,
        policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
    });

    new aws.iam.RolePolicyAttachment("rolePolicyAttachmentDynamoDB", {
        role: role.name,
        policyArn: "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
    });

    new aws.iam.RolePolicyAttachment("rolePolicyAttachmentLambda", {
        role: role.name,
        // policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        policyArn: "arn:aws:iam::aws:policy/AWSLambda_FullAccess",
    });
    
    // // Create an IAM instance profile for the role
    const instanceProfile = new aws.iam.InstanceProfile("myInstanceProfile", {
        role: role.name,
    });

    
    const snsPublishPolicy = new aws.iam.Policy("SNSPublishPolicy", {
        policy: {
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Action: "sns:Publish",
                Resource: snsTopic.arn,
            }],
        },
        roles: [role.name],
    });

    const snsPublishPolicyAttachment = new aws.iam.RolePolicyAttachment("SNSPublishPolicyAttachment", {
        role: role.name,
        policyArn: snsPublishPolicy.arn,
    });



    
//Creating user data
//rds instance, systemd, cloudwatch
const userDataScript = pulumi.interpolate`#!/bin/bash
echo "URL=jdbc:mysql://${rdsInstance.address}:3306/${rdsInstance.dbName}?createDatabaseIfNotExist=true" >> /etc/environment
echo "USER=${rdsInstance.username}" >> /etc/environment
echo "PASS=${rdsInstance.password}" >> /etc/environment 
echo "TopicARN=${snsTopic.arn}" >> /etc/environment
echo "AWS_REGION=us-east-1" >> /etc/environment
echo "AWS_PROFILE=demo" >> /etc/environment

sudo cd
sudo chown -R csye6225:csye6225 /opt/csye6225
sudo chown csye6225:csye6225 /opt/csye6225/csye6225.log

sudo systemctl daemon-reload
sudo systemctl enable webapp
sudo systemctl start webapp
sudo systemctl restart webapp

sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -c file:/opt/cloudwatch-config.json \
    -s


`;
// const ami = pulumi.output(aws.ec2.getAmi)

// const instance = new aws.ec2.Instance("instance", {
//     ami: configFile.ami,
//     instanceType: configFile.instance_type,
//     disableApiTermination: false, // Protect against accidental termination.
//     associatePublicIpAddress: true,
//     subnetId: publicSubnets[0].id,
//     userDataReplaceOnChange:true,
//     iamInstanceProfile:instanceProfile,
//     userData: userDataScript.apply((data) => Buffer.from(data).toString("base64")),
//     vpcSecurityGroupIds: [
//         securityGroup.id
//     ],
//     keyName: configFile.keyPair,

//     rootBlockDevice: {

//         volumeSize: configFile.volumeSize, // Root volume size in GB.

//         volumeType: configFile.volumeType, // Root volume type.

//         deleteOnTermination: true, // Delete the root EBS volume on instance termination.

//     },
//     dependsOn:[rdsInstance],
//     tags: {
//         Name: `My_Instance`
//     }

// });


// const my_subnet = new aws.ec2.Subnet("main_subnet",{
//     vpcId:my_VPC.id,
//     cidrBlock:"10.0.1.0/24",
//     availabilityZone:"us-east-1a",
//     tags:{
//         Name:"main_sub"
//     }
// });

// const pri_subnet = new aws.ec2.Subnet("pri_subnet",{
//     vpcId:my_VPC.id,
//     cidrBlock:"10.0.0.0/24",
//     availabilityZone:"us-east-1a",
//     tags:{
//         Name:"private_Subnet"
//     }
// });

const private_routeTable = new aws.ec2.RouteTable("private_routeTable", {
    vpcId: my_VPC.id,
    tags: {
        Name: "private_RouteTable"
    }
});


const public_routeTable = new aws.ec2.RouteTable("public_routeTable", {
    vpcId: my_VPC.id,
    tags: {
        Name: "public_RouteTable"
    }
}
);

// const private_Route = new aws.ec2.Route("private_Route",{
//     routeTableId:private_routeTable.id,

// });

//Creating routes, for traffic and destination
const public_Routes = new aws.ec2.Route("public_Routes", {
    routeTableId: public_routeTable.id,
    gatewayId: my_ig.id,
    destinationCidrBlock: "0.0.0.0/0"
});

//public routeTable associations
for (let j = 1; j <= configFile.numOfPubSubnets; j++) {
    let routeTableAssociation = new aws.ec2.RouteTableAssociation(`routeTableAssociation-${j}`, {
        routeTableId: public_routeTable.id,
        subnetId: publicSubnets[j - 1].id,
        tags: {
            Name: `PublicRouteAssociation-${j}`
        }
    });

}
//private routeTable Associations
for (let k = 1; k <= configFile.numOfPriSubnets; k++) {
    let priRouteTableAssociation = new aws.ec2.RouteTableAssociation(`PriRouteTableAssociation-${k}`, {
        routeTableId: private_routeTable.id,
        subnetId: privateSubnets[k - 1].id,
        tags: {
            Name: `PrivateRouteAssociation-${k}`
        }
    });


}




// const my_routeTableAssociation = new aws.ec2.RouteTableAssociation("main_routeTableAssociateion",{
//     routeTableId:my_routeTable.id,
//     subnetId:my_subnet.id
// });

// const private_routeTableAssociation = new aws.ec2.RouteTableAssociation("privateRouteTableAssociation",{
//     routeTableId:private_routeTable.id,
//     subnetId:pri_subnet.id
// });

const ec2LaunchTemplate = new aws.ec2.LaunchTemplate("LaunchTemplate_EC2", {
    name: "LaunchTemplate_EC2",
    imageId: configFile.ami,

    instanceType: configFile.instance_type,
    keyName: configFile.keyPair,
    iamInstanceProfile: { name: instanceProfile.name },
    networkInterfaces: [{
        associatePublicIpAddress: "true",
        subnetId: publicSubnets[0].id,
        securityGroups: [securityGroup.id],
    }],
    tagSpecifications: [{
        resourceType: "instance",
        tags: {
            Name: "LaunchTemplate_EC2",
        },
    }],
    blockDeviceMappings: [{
        deviceName: "/dev/sdf",
        ebs: {
            volumeSize: configFile.volumeSize, // Root volume size in GB.
            volumeType: configFile.volumeType, // Root volume type.
            deleteOnTermination: true, // Delete the root EBS volume on instance termination.
        },
    }],

    userData: userDataScript.apply((data) => Buffer.from(data).toString("base64")),
});

 // Create an AWS Application Load Balancer
 const lb = new aws.lb.LoadBalancer("lb", {
    name: "csye6225-lb",
    internal: false,
    loadBalancerType: "application",
    securityGroups: [lbSecGrp.id],
    subnets: pulumi.output(publicSubnets).apply(subnets => subnets.map(subnet => subnet.id)),
    tags: {
        Application: "webapp",
    },
});

// Create an AWS Target Group
const targetGroup = new aws.lb.TargetGroup("target_group", {
    name: "csye6225-lb-alb-tg",
    port: 8080,//application port
    targetType: "instance",
    
    protocol: "HTTP",
    vpcId: my_VPC.id,
    healthCheck: {
        healthyThreshold: 3,
        unhealthyThreshold: 3,
        timeout: 10,
        interval: 30,
        path: "/healthz",
    },
});

// Create an AWS Listener for the Load Balancer
const listener = new aws.lb.Listener("front_end", {
    loadBalancerArn: lb.arn,
    // port: 80,//http port
    port: 443,
    sslPolicy: "ELBSecurityPolicy-2016-08",
    certificateArn: "arn:aws:acm:us-east-1:455958282906:certificate/d1c2bf8c-8094-4b4a-bfe3-b3d38faf1bb2",
    protocol: "HTTPS",
    defaultActions: [{
        type: "forward",
        targetGroupArn: targetGroup.arn,
    }],
});

const autoScalingGroup = new aws.autoscaling.Group("asg", {
    name: "asg_launch_config",
    maxSize: 3,
    minSize: 1,
    desiredCapacity: 1,
    forceDelete: true,
    defaultCooldown: 60,
    vpcZoneIdentifiers: pulumi.output(publicSubnets).apply(ids => ids || []),
    tags: [
      {
        key: "Name",
        value: "autoScalingGroup",
        propagateAtLaunch: true,
      },
    ],
    launchTemplate: {
      id: ec2LaunchTemplate.id,
      version: "$Latest",
    },
    dependsOn: [targetGroup],
    targetGroupArns: [targetGroup.arn],
  });

const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
    autoscalingGroupName: autoScalingGroup.name,
    scalingAdjustment: 1,
    cooldown: 60,
    adjustmentType: "ChangeInCapacity",
    autocreationCooldown: 60,
    cooldownDescription: "Scale up policy when average CPU usage is above 5%",
    policyType: "SimpleScaling",
    scalingTargetId: autoScalingGroup.id,
  });

  const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
    autoscalingGroupName: autoScalingGroup.name,
    scalingAdjustment: -1,
    cooldown: 60,
    adjustmentType: "ChangeInCapacity",
    autocreationCooldown: 60,
    cooldownDescription:
      "Scale down policy when average CPU usage is below 3%",
    policyType: "SimpleScaling",
    scalingTargetId: autoScalingGroup.id,
  });

  const cpuUtilizationAlarmHigh = new aws.cloudwatch.MetricAlarm(
    "cpuUtilizationAlarmHigh",
    {
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 1,
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      period: 60,
      threshold: 5,
      statistic: "Average",
      alarmActions: [scaleUpPolicy.arn],
      dimensions: { AutoScalingGroupName: autoScalingGroup.name },
    }
  );

  const cpuUtilizationAlarmLow = new aws.cloudwatch.MetricAlarm(
    "cpuUtilizationAlarmLow",
    {
      comparisonOperator: "LessThanThreshold",
      evaluationPeriods: 1,
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      period: 60,
      statistic: "Average",
      threshold: 3,
      alarmActions: [scaleDownPolicy.arn],
      dimensions: { AutoScalingGroupName: autoScalingGroup.name },
    }
  );

  const hostedZoneId = configFile.hostedZoneId;

  const demoArecord = new route53.Record("aRecord", {
    zoneId: hostedZoneId,
    name: configFile.domainName,
    type: "A",
    aliases: [{
        name: lb.dnsName,
        zoneId: lb.zoneId,
        evaluateTargetHealth: true,
    }],
});




