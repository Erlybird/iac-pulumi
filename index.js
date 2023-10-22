
"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const awsx = require("@pulumi/awsx");
const fs = require('fs');
const yaml = require('js-yaml');


let NameOfStack = pulumi.getStack();
let FileName = `Pulumi.${NameOfStack}.yaml`;
const configFile = yaml.load(fs.readFileSync(FileName, 'utf8'));

// const current = aws.getRegion({});


const my_VPC = new aws.ec2.Vpc(`${configFile.vpcName}`,
    {cidrBlock: configFile.baseCIDRBlock,
tags:{
    Name:configFile.vpcName
}});

const my_ig = new aws.ec2.InternetGateway(`${configFile.igName}`,{
    tags:{
        Name: configFile.igName

    }
});

const vpc_ig_attacher = new aws.ec2.InternetGatewayAttachment("vpc_ig_attacher",{
    vpcId:my_VPC.id,
    internetGatewayId:my_ig.id,
    tags:{
        Name: "VPC_IGW_Attacher"
    }
});
let counter = 0;
//function for creating a subnet- private or public
const CreateSubnets = ( vpc , type , noOfSubnets) => {
    const OctetsGiven = configFile.subnetCIDR.split('.');
    let midOctet = parseInt(OctetsGiven[2]);
    let Subnets = [];
    for(let i =1; i< noOfSubnets+1; i++){
        let tempSubnet = new aws.ec2.Subnet(`${type}-Subnet-${i}`,{
            vpcId: vpc.id,
            cidrBlock: `${OctetsGiven[0]}.${OctetsGiven[1]}.${midOctet+counter++}.${OctetsGiven[3]}/${configFile.subnetMask}`,
            availabilityZone:`${configFile.availabilityZone}${String.fromCharCode(96 + i)}`,
            tags:{
                Name: `${type}-Subnet-${i}`
            }
        });
        Subnets.push(tempSubnet);
    }
    return Subnets;
}

//Creating public and Private Subnets
const publicSubnets = CreateSubnets(my_VPC,'public',configFile.numOfPubSubnets);
const privateSubnets = CreateSubnets(my_VPC,'private',configFile.numOfPriSubnets);

//creating security groups
const securityGroup = new aws.ec2.SecurityGroup("security-group",{
    vpcId: my_VPC.id,
    ingress: [
        {
        cidrBlocks: ["0.0.0.0/0"],
        protocol: "tcp",
        fromPort: 80,
        toPort: 80
        },
        {
            ipv6CidrBlocks: ["::/0"],
            protocol: "tcp",
            fromPort: 80,
            toPort: 80
        },
        {
        cidrBlocks: ["0.0.0.0/0"],
        protocol: "tcp",
        fromPort: 443,
        toPort: 443
        },
        {
        ipv6CidrBlocks: ["::/0"],
        protocol: "tcp",
        fromPort: 443,
        toPort: 443
        },
        {
            cidrBlocks: [configFile.myIP],
            protocol: "tcp",
            fromPort: 22,
            toPort: 22
        },
        {
            cidrBlocks: ["0.0.0.0/0"],
            protocol: "tcp",
            fromPort: 8080,
            toPort: 8080
        }
    ],
    egress: [
        {
        cidrBlocks: [ "0.0.0.0/0" ],
        fromPort: 0,
        toPort: 0,
        protocol: "-1"
        }
    ]
});


// const ami = pulumi.output(aws.ec2.getAmi)
const instance = new aws.ec2.Instance("instance",{
    ami: configFile.ami,
    instanceType: configFile.instance_type,
    disableApiTermination: false, // Protect against accidental termination.
    associatePublicIpAddress: true,
    subnetId: publicSubnets[0].id,
    vpcSecurityGroupIds: [
        securityGroup.id
    ],
    keyName:configFile.keyPair,
    
    rootBlockDevice: {

        volumeSize: configFile.volumeSize, // Root volume size in GB.

        volumeType: configFile.volumeType, // Root volume type.

        deleteOnTermination: true, // Delete the root EBS volume on instance termination.

    },
    tags: {
        Name: `My_Instance`
    }

});


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

const private_routeTable = new aws.ec2.RouteTable("private_routeTable",{
    vpcId:my_VPC.id,
    tags: {
        Name: "private_RouteTable"
    }
});


const public_routeTable = new aws.ec2.RouteTable("public_routeTable",{
    vpcId:my_VPC.id,
    tags: {
        Name: "public_RouteTable"
    }
    }
    );

// const private_Route = new aws.ec2.Route("private_Route",{
//     routeTableId:private_routeTable.id,
    
// });

//Creating routes, for traffic and destination
const public_Routes = new aws.ec2.Route("public_Routes",{
    routeTableId:public_routeTable.id,
    gatewayId:my_ig.id,
    destinationCidrBlock:"0.0.0.0/0"
});

//public routeTable associations
for( let j =1; j<= configFile.numOfPubSubnets;j++){
    let routeTableAssociation = new aws.ec2.RouteTableAssociation(`routeTableAssociation-${j}`,{
    routeTableId:public_routeTable.id,
    subnetId: publicSubnets[j-1].id,
    tags:{
        Name: `PublicRouteAssociation-${j}`
    }  });

}
//private routeTable Associations
for(let k=1; k<= configFile.numOfPriSubnets; k++){
    let priRouteTableAssociation = new aws.ec2.RouteTableAssociation(`PriRouteTableAssociation-${k}`,{
        routeTableId:private_routeTable.id,
        subnetId: privateSubnets[k-1].id,
        tags:{
            Name: `PrivateRouteAssociation-${k}`
        }  });
    

}


// const my_routeTableAssociation = new aws.ec2.RouteTableAssociation("main_routeTableAssociateion",{
//     routeTableId:my_routeTable.id,
//     subnetId:my_subnet.id
// });

// const private_routeTableAssociation = new aws.ec2.RouteTableAssociation("privateRouteTableAssociation",{
//     routeTableId:private_routeTable.id,
//     subnetId:pri_subnet.id
// });





