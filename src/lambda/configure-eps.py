import os
import sys
import boto3
import json
from datetime import date, datetime
import traceback

intf_svcs = [
    "com.amazonaws.us-east-1.elasticloadbalancing",
    "com.amazonaws.us-east-1.ec2",
    "com.amazonaws.us-east-1.ecr.dkr",
    "com.amazonaws.us-east-1.logs",
    "com.amazonaws.us-east-1.sts",
    "com.amazonaws.us-east-1.ecr.api"
]

gw_svcs = [
    "com.amazonaws.us-east-1.s3"
]

session = boto3.Session()

def json_serial(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError('Type %s not serializable' % type(obj))

def get_intf_vpc_eps(ec2_client, vpc_id):
    vpc_ep_ids = []
    filters = []
    svcFilter = {
        'Name': 'service-name',
        'Values': intf_svcs
    }
    vpcFilter = {
        'Name': 'vpc-id',
        'Values': [ vpc_id ]
    }
    filters.append(svcFilter)
    filters.append(vpcFilter)
    try:
        paginator = ec2_client.get_paginator('describe_vpc_endpoints')
        iterator = paginator.paginate(Filters=filters)
        for page in iterator:
            for vpc_ep in page['VpcEndpoints']:
                vpc_ep_ids.append(vpc_ep['VpcEndpointId'])
        return vpc_ep_ids
    except Exception as e:
        print(f'Failed in describe_vpc_endpoints(..): {e}')
        print(str(e))
        print(traceback.format_exc())

def get_gw_vpc_eps(ec2_client, vpc_id):
    vpc_ep_ids = []
    filters = []
    svcFilter = {
        'Name': 'service-name',
        'Values': gw_svcs
    }
    vpcFilter = {
        'Name': 'vpc-id',
        'Values': [ vpc_id ]
    }
    filters.append(svcFilter)
    filters.append(vpcFilter)
    try:
        response = ec2_client.describe_vpc_endpoints(
            Filters=filters
        )
        for vpc_ep in response['VpcEndpoints']:
            vpc_ep_ids.append(vpc_ep['VpcEndpointId'])
        return vpc_ep_ids
    except Exception as e:
        print(f'Failed in describe_vpc_endpoints(..): {e}')
        print(str(e))
        print(traceback.format_exc())

def update_intf_ep(ec2_client, vpc_ep_id, subnet_ids, sg_ids):
    try:
        ec2_client.modify_vpc_endpoint(
            VpcEndpointId=vpc_ep_id,
            AddSubnetIds=subnet_ids,
            AddSecurityGroupIds=sg_ids
        )
        print('VPC Endpoint: {} modified'.format(vpc_ep_id))
    except Exception as e:
        print(f'Failed in modify_vpc_endpoint(..): {e}')
        print(str(e))
        print(traceback.format_exc())

def reset_intf_ep(ec2_client, vpc_ep_id, subnet_ids, sg_ids):
    try:
        ec2_client.modify_vpc_endpoint(
            VpcEndpointId=vpc_ep_id,
            RemoveSubnetIds=subnet_ids,
            RemoveSecurityGroupIds=sg_ids
        )
        print('VPC Endpoint: {} is reset'.format(vpc_ep_id))
    except Exception as e:
        print(f'Failed in modify_vpc_endpoint(..): {e}')
        print(str(e))
        print(traceback.format_exc())
    
def update_gw_ep(ec2_client, vpc_ep_id, rtb_ids):
    try:
        ec2_client.modify_vpc_endpoint(
            VpcEndpointId=vpc_ep_id,
            AddRouteTableIds=rtb_ids
        )
        print('Vpc Endpoint: {} is modified'.format(vpc_ep_id))
    except Exception as e:
        print(f'Failed in modify_vpc_endpoint(..): {e}')
        print(str(e))
        print(traceback.format_exc())

def reset_gw_ep(ec2_client, vpc_ep_id, rtb_ids):
    try:
        ec2_client.modify_vpc_endpoint(
            VpcEndpointId=vpc_ep_id,
            RemoveRouteTableIds=rtb_ids
        )
        print('Vpc Endpoint: {} is reset'.format(vpc_ep_id))
    except Exception as e:
        print(f'Failed in modify_vpc_endpoint(..): {e}')
        print(str(e))
        print(traceback.format_exc())

def on_create(event):
    try:
        resProps = event['ResourceProperties']
        vpc_id = resProps['vpc_id']
        subnet_ids = resProps['subnet_ids'].split(',')
        sg_ids = resProps['sg_ids'].split(',')
        rtb_ids = resProps['rtb_ids'].split(',')
        ec2_client = session.client('ec2')
        intf_vpc_eps = get_intf_vpc_eps(ec2_client, vpc_id)
        gw_vpc_eps = get_gw_vpc_eps(ec2_client, vpc_id)
        for intf_vpc_ep in intf_vpc_eps:
            update_intf_ep(ec2_client, intf_vpc_ep, subnet_ids, sg_ids)
        for gw_vpc_ep in gw_vpc_eps:
            update_gw_ep(ec2_client, gw_vpc_ep, rtb_ids)
        response = {
            'statusCode': 200,
            'intf_vpc_eps': intf_vpc_eps,
            'gw_vpc_eps': gw_vpc_eps
        }
        return {
            'Data': response
        }
    except Exception as e:
        print(f'Failed in on_create(..): {e}')
        print(str(e))
        print(traceback.format_exc())
        raise ValueError('on_create failed')

def on_delete(event):
    try:
        resProps = event['ResourceProperties']
        vpc_id = resProps['vpc_id']
        subnet_ids = resProps['subnet_ids'].split(',')
        sg_ids = resProps['sg_ids'].split(',')
        rtb_ids = resProps['rtb_ids'].split(',')
        ec2_client = session.client('ec2')
        intf_vpc_eps = get_intf_vpc_eps(ec2_client, vpc_id)
        gw_vpc_eps = get_gw_vpc_eps(ec2_client, vpc_id)
        for intf_vpc_ep in intf_vpc_eps:
            reset_intf_ep(ec2_client, intf_vpc_ep, subnet_ids, sg_ids)
        for gw_vpc_ep in gw_vpc_eps:
            reset_gw_ep(ec2_client, gw_vpc_ep, rtb_ids)
        return {
            'PhysicalResourceId': event["PhysicalResourceId"]
        }
    except Exception as e:
        print(f'Failed in on_delete(..): {e}')
        print(str(e))
        print(traceback.format_exc())
        raise ValueError('on_delete failed')
        

def on_event(event, context):
    print(event)
    # Not handling 'Update'
    # Not expected to apply changeset on stack 
    request_type = event['RequestType']
    if request_type == 'Create':
        return on_create(event)
    elif request_type == 'Delete':
        return on_delete(event)