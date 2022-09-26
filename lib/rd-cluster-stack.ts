import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as cr from 'aws-cdk-lib/custom-resources';
import cdk = require('aws-cdk-lib');
import { RdConfigEps } from './rd-config-eps';

export class RdClusterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const vpc_cidr = '192.168.0.0/18';
    const vpc_cgnat_cidr = '100.64.0.0/18';
    
    const accountId = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;
    // create vpc for EKS
    const eksVpc = new ec2.Vpc(this, 'rd-eks-vpc', {
      cidr: vpc_cidr,
      availabilityZones: [ 'us-east-1a', 'us-east-1b' ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          cidrMask: 20,
          name: 'pub',
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          cidrMask: 20,
          name: 'priv',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
        }
      ],
      gatewayEndpoints: {
        S3: {
          service: ec2.GatewayVpcEndpointAwsService.S3
        }
      }
    });
    // CGNAT Cidr Block
    const cgNatCidrBlock = new ec2.CfnVPCCidrBlock(this, 'CGNATCidr', {
      vpcId: eksVpc.vpcId,
      cidrBlock: vpc_cgnat_cidr,
    });
    const cgNatPubSubnet1 = new ec2.CfnSubnet(this, 'cgnat-pub-subnet1', {
      availabilityZone: 'us-east-1c',
      cidrBlock: '100.64.0.0/20',
      mapPublicIpOnLaunch: true,
      vpcId: eksVpc.vpcId,
      tags: [
        {
          key: 'Name',
          value: 'RdClusterStack/rd-eks-vpc/cgnat-pub-subnet1'
        }
      ]
    });
    cgNatPubSubnet1.addDependsOn(cgNatCidrBlock);
    const cgNatPubSubnet2 = new ec2.CfnSubnet(this, 'cgnat-pub-subnet2', {
      availabilityZone: 'us-east-1d',
      cidrBlock: '100.64.16.0/20',
      mapPublicIpOnLaunch: true,
      vpcId: eksVpc.vpcId,
      tags: [
        {
          key: 'Name',
          value: 'RdClusterStack/rd-eks-vpc/cgnat-pub-subnet2'
        }
      ]
    });
    cgNatPubSubnet2.addDependsOn(cgNatCidrBlock);
    const cgNatPrivSubnet1 = new ec2.CfnSubnet(this, 'cgnat-priv-subnet1', {
      availabilityZone: 'us-east-1c',
      cidrBlock: '100.64.32.0/20',
      mapPublicIpOnLaunch: false,
      vpcId: eksVpc.vpcId,
      tags: [
        {
          key: 'Name',
          value: 'RdClusterStack/rd-eks-vpc/cgnat-priv-subnet1'
        }
      ]
    });
    cgNatPrivSubnet1.addDependsOn(cgNatCidrBlock);
    const cgNatPrivSubnet2 = new ec2.CfnSubnet(this, 'cgnat-priv-subnet2', {
      availabilityZone: 'us-east-1d',
      cidrBlock: '100.64.48.0/20',
      mapPublicIpOnLaunch: false,
      vpcId: eksVpc.vpcId,
      tags: [
        {
          key: 'Name',
          value: 'RdClusterStack/rd-eks-vpc/cgnat-priv-subnet2'
        }
      ]
    });
    cgNatPrivSubnet2.addDependsOn(cgNatCidrBlock);    
    // Route Tables for cgnat subnets
    const cgNatPubRtb1 = new ec2.CfnRouteTable(this, 'cgnat-pub-rtb1', {
      vpcId: eksVpc.vpcId,
      tags: [
        {
          key: 'Name',
          value: 'RdClusterStack/rd-eks-vpc/cgnat-pub-rtb1'
        }
      ]
    });
    cgNatPubRtb1.addDependsOn(cgNatPubSubnet1);
    const cgNatPubRtb2 = new ec2.CfnRouteTable(this, 'cgnat-pub-rtb2', {
      vpcId: eksVpc.vpcId,
      tags: [
        {
          key: 'Name',
          value: 'RdClusterStack/rd-eks-vpc/cgnat-pub-rtb2'
        }
      ]
    });
    // Could not get NAT Gateway Id - This needs to be set manually
    const cgNatPrivRtb1 = new ec2.CfnRouteTable(this, 'cgnat-priv-rtb1', {
      vpcId: eksVpc.vpcId,
      tags: [
        {
          key: 'Name',
          value: 'RdClusterStack/rd-eks-vpc/cgnat-priv-rtb1'
        }
      ]
    });
    cgNatPrivRtb1.addDependsOn(cgNatPrivSubnet1);
    const cgNatPrivRtb2 = new ec2.CfnRouteTable(this, 'cgnat-priv-rtb2', {
      vpcId: eksVpc.vpcId,
      tags: [
        {
          key: 'Name',
          value: 'RdClusterStack/rd-eks-vpc/cgnat-priv-rtb2'
        }
      ]
    });
    cgNatPrivRtb2.addDependsOn(cgNatPrivSubnet2);
    // cgnat subnet associations
    const cgNatSubnetRtbAssoc1 = new ec2.CfnSubnetRouteTableAssociation(this, 'cgNatSubnetRtbAssoc1', {
      routeTableId: cgNatPubRtb1.attrRouteTableId,
      subnetId: cgNatPubSubnet1.attrSubnetId
    });
    const cgNatSubnetRtbAssoc2 = new ec2.CfnSubnetRouteTableAssociation(this, 'cgNatSubnetRtbAssoc2', {
      routeTableId: cgNatPubRtb2.attrRouteTableId,
      subnetId: cgNatPubSubnet2.attrSubnetId
    });
    const cgNatSubnetRtbAssoc3 = new ec2.CfnSubnetRouteTableAssociation(this, 'cgNatSubnetRtbAssoc3', {
      routeTableId: cgNatPrivRtb1.attrRouteTableId,
      subnetId: cgNatPrivSubnet1.attrSubnetId
    });
    const cgNatSubnetRtbAssoc4 = new ec2.CfnSubnetRouteTableAssociation(this, 'cgNatSubnetRtbAssoc4', {
      routeTableId: cgNatPrivRtb2.attrRouteTableId,
      subnetId: cgNatPrivSubnet2.attrSubnetId
    });
    const cgNatEndpointSG = new ec2.SecurityGroup(this, 'cgNatSG', {
      vpc: eksVpc,
      securityGroupName: 'cgNatSG'
    });
    cgNatEndpointSG.addIngressRule(ec2.Peer.ipv4(vpc_cgnat_cidr), ec2.Port.tcp(443), `from ${vpc_cgnat_cidr}:433`)
    // ECR API endpoint
    eksVpc.addInterfaceEndpoint('EcrApiEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR
    });
    // ECR DKR endpoint
    eksVpc.addInterfaceEndpoint('EcrDkrEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER
    });
    // EC2 endpoint
    eksVpc.addInterfaceEndpoint('Ec2Endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.EC2
    });
    // CWLogs endpoint
    eksVpc.addInterfaceEndpoint('CWLogs', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS
    });
    // STS endpoint
    eksVpc.addInterfaceEndpoint('STSEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.STS
    });
    // ALB endpoint
    eksVpc.addInterfaceEndpoint('ALBEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ELASTIC_LOAD_BALANCING
    });
    // CGNAT subnets - NGW
    const cgNatNgwEip1 = new ec2.CfnEIP(this, 'CgNatNgwEip1');
    const cgNatNgwEip2 = new ec2.CfnEIP(this, 'CgNatNgwEip2');
    const cgNatNgw1 = new ec2.CfnNatGateway(this, 'CgNatNgw1', {
      allocationId: cgNatNgwEip1.attrAllocationId,
      connectivityType: 'public',
      subnetId: cgNatPrivSubnet1.attrSubnetId,
      tags: [
        {
          key: 'Name',
          value: 'CgNatNgw1'
        }
      ]
    });
    const cgNatNgw2 = new ec2.CfnNatGateway(this, 'CgNatNgw2', {
      allocationId: cgNatNgwEip2.attrAllocationId,
      connectivityType: 'public',
      subnetId: cgNatPrivSubnet2.attrSubnetId,
      tags: [
        {
          key: 'Name',
          value: 'CgNatNgw2'
        }
      ]
    });
    // CGNAT RTBs - Update Routes for IGW
    const cgNatNgwRoute1 = new ec2.CfnRoute(this, 'CgNatNgwRoute1', {
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: eksVpc.internetGatewayId,
      routeTableId: cgNatPubRtb1.attrRouteTableId
    });
    const cgNatNgwRoute2 = new ec2.CfnRoute(this, 'CgNatNgwRoute2', {
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: eksVpc.internetGatewayId,
      routeTableId: cgNatPubRtb2.attrRouteTableId
    });
    // CGNAT RTBs - Update Routes for NAT
    const cgNatNgwRoute3 = new ec2.CfnRoute(this, 'CgNatNgwRoute3', {
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: cgNatNgw1.attrNatGatewayId,
      routeTableId: cgNatPrivRtb1.attrRouteTableId
    });
    cgNatNgwRoute3.addDependsOn(cgNatNgw1);
    const cgNatNgwRoute4 = new ec2.CfnRoute(this, 'CgNatNgwRoute4', {
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: cgNatNgw2.attrNatGatewayId,
      routeTableId: cgNatPrivRtb2.attrRouteTableId
    });
    cgNatNgwRoute4.addDependsOn(cgNatNgw2);
    const configVpcEPs = new RdConfigEps(this, 'config-vpc-eps', {
      account_id: accountId,
      region: region,
      vpc_id: eksVpc.vpcId,
      subnet_ids: cgNatPrivSubnet1.attrSubnetId+','+cgNatPrivSubnet2.attrSubnetId,
      sg_ids: cgNatEndpointSG.securityGroupId,
      rtb_ids: cgNatPrivRtb1.attrRouteTableId+','+cgNatPrivRtb2.attrRouteTableId
    });
    configVpcEPs.node.addDependency(cgNatPrivRtb1);
    configVpcEPs.node.addDependency(cgNatPrivRtb2);
    // Just to give enough time for VPC Endpoints
    configVpcEPs.node.addDependency(cgNatNgw1);
    configVpcEPs.node.addDependency(cgNatNgw2);

    // Master user
    const masterUser = iam.User.fromUserName(this, 'ClusterAdminUser', 'rajasekhar.durvasula@kyndryl.com');
    // EKS cluster
    const eksCluster = new eks.Cluster(this, 'rd-cluster', {
      clusterName: 'rdcluster',
      vpc: eksVpc,
      defaultCapacityInstance: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MEDIUM),
      version: eks.KubernetesVersion.V1_21
    });
    // Add AwsAuth
    eksCluster.awsAuth.addUserMapping(masterUser, {
      groups: [ 'system:masters' ]
    });

  }
}
