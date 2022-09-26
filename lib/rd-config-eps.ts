import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import fs = require('fs');
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import * as path from 'path';
import { uuid } from 'uuidv4';

export interface RdConfigEpsProps {
    account_id: string;
    region: string;
    vpc_id: string;
    subnet_ids: string;
    sg_ids: string;
    rtb_ids: string;
}

export class RdConfigEps extends Construct {
    public readonly response: string;
    
    constructor(scope: Construct, id: string, props: RdConfigEpsProps) {
        super(scope, id);
        
        // new lambda.InlineCode(fs.readFileSync(path.join(__filename, '../src/lambda/configure-eps.py'), { encoding: 'utf-8' })),
        const onEvent = new lambda.SingletonFunction(this, 'ConfigureEpsSingleton', {
            uuid: uuid(),
            code: lambda.Code.fromAsset('src/lambda'),
            handler: 'configure-eps.on_event',
            timeout: cdk.Duration.seconds(120),
            runtime: lambda.Runtime.PYTHON_3_9,
            description: 'Lambda to configure vpc endpoints'
        });
        onEvent.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "ec2:ModifyVpcEndpoint"
            ],
            effect: iam.Effect.ALLOW,
            resources: [
                `arn:aws:ec2:${props.region}:${props.account_id}:vpc-endpoint/*`,
                `arn:aws:ec2:${props.region}:${props.account_id}:subnet/*`,
                `arn:aws:ec2:${props.region}:${props.account_id}:route-table/*`,
                `arn:aws:ec2:${props.region}:${props.account_id}:security-group/*`
            ]
        }));
        onEvent.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                "ec2:DescribeVpcEndpoints"
            ],
            effect: iam.Effect.ALLOW,
            resources: [
                "*"
            ]
        }));
        
        const rdConfigEpsProvider = new cr.Provider(this, 'RdConfigEpsProvider', {
            onEventHandler: onEvent,
            logRetention: logs.RetentionDays.ONE_DAY
        });
        
        const rdConfigEpsResource = new cdk.CustomResource(this, 'RdConfigEpsResource', {
            serviceToken: rdConfigEpsProvider.serviceToken,
            properties: props
        });
        
    }
}