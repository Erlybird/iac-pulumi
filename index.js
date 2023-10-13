
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

const my_VPC = new aws.ec2.Vpc("my_Vpc",
    {cidrBlock:"10.0.0.0/16",
tags:{
    Name:"VPC"
}});

const my_ig = new aws.ec2.InternetGateway("my_ig",{
    tags:{
        Name: "IGW"
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
            cidrBlock: `${OctetsGiven[0]}.${OctetsGiven[1]}.${midOctet+counter++}.${OctetsGiven[3]}/24`,
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





