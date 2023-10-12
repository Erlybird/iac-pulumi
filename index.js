const aws = require("@pulumi/aws");
const pulumi = require("@pulumi/pulumi");
// const config = require("./config");


const fs = require('fs');
const yaml = require('js-yaml');

let stackName = pulumi.getStack();
let configFileName = `Pulumi.${stackName}.yaml`;



    const config = yaml.load(fs.readFileSync(configFileName, 'utf8'));


let id = 0;


const createSubnets = (vpc, type, count) => {
    let subnets = [];

    // const baseCIDR = config.subnetCIDR; // Split the base CIDR
    const octets = config.subnetCIDR.split('.');

    // Parse the third octet as an integer
    let thirdOctet = parseInt(octets[2]);

    for (let i = 0; i < count; i++) {
        let subnet = new aws.ec2.Subnet(`subnet-${type}-${i}`, {
            vpcId: vpc.id,
            cidrBlock: `${octets[0]}.${octets[1]}.${id++}.${octets[3]}/24`,
            // cidrBlock: `10.0.${++id}.0/24`,
            // cidrBlock: pulumi.interpolate`${baseCIDR.apply(base =>
            //     base.map((part, index) =>
            //         (index === 2) ? `${++id}.0` : part))}/24`,
            availabilityZone: `${config.availabilityZone}${String.fromCharCode(97 + i)}`,
            tags: {
                Name: `subnet-${type}-${i}`,
                Type: type
            }
        });
        subnets.push(subnet);
    }
    return subnets;
}

const main = async () => {

    // Create a VPC
    const vpc = new aws.ec2.Vpc("my-vpc", {
        cidrBlock: config.baseCIDRBlock,
        tags: {
            Name: config.vpcName,
        },
    });

    // Create public subnets
    const publicSubnets = createSubnets(vpc, 'public', config.numOfPubSubnets);

    // Create private subnets
    const privateSubnets = createSubnets(vpc, 'private', config.numOfPriSubnets);

    // Create an internet gateway and attach it to the VPC
    const internetGateway = new aws.ec2.InternetGateway("igw", {
        tags: {
            Name: config.igName,
        },
    });

    const vpcGatewayAttachment = new aws.ec2.InternetGatewayAttachment("vpcGatewayAttachment", {
        vpcId: vpc.id,
        internetGatewayId: internetGateway.id
    });

    // Create public route tables
    const publicRouteTable = new aws.ec2.RouteTable("public-route-table", {
        vpcId: vpc.id,
    });

    // Create private route tables
    const privateRouteTable = new aws.ec2.RouteTable("private-route-table", {
        vpcId: vpc.id,
    });

    //create a public route and setting a cidr destination
    const publicRoute = new aws.ec2.Route("publicRoute", {
        routeTableId: publicRouteTable.id,
        destinationCidrBlock: "0.0.0.0/0",
        gatewayId: internetGateway.id
    });

    // Associate the public route tables with the public subnets
    for (let i = 0; i < config.numOfPubSubnets; i++) {
        new aws.ec2.RouteTableAssociation(`public-association-${i}`, {
            subnetId: publicSubnets[i].id,
            routeTableId: publicRouteTable.id,
        });
    }

    // Associate the public route tables with the public subnets
    for (let i = 0; i < config.numOfPriSubnets; i++) {
        new aws.ec2.RouteTableAssociation(`private-association-${i}`, {
            subnetId: privateSubnets[i].id,
            routeTableId: privateRouteTable.id,
        });
    }

    return { vpcId: vpc.id, publicSubnets, privateSubnets, internetGatewayId: internetGateway.id, publicRoute, vpcGatewayAttachment };
}

exports = main();
