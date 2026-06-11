"""False-positive fixture for core-security-insecure-deserialization.

JSON + yaml.safe_load. Rule must NOT fire.
"""
import json
import yaml


def deserialize_request(request):
    return json.loads(request.body)


def load_config(request):
    return yaml.safe_load(request.body)


def load_config_explicit(request):
    # Explicit SafeLoader — also fine.
    return yaml.load(request.body, Loader=yaml.SafeLoader)
