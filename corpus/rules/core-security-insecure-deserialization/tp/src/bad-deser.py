"""True-positive fixture for core-security-insecure-deserialization.

pickle.loads on request bytes + yaml.load without SafeLoader. Rule MUST fire.
"""
import pickle
import yaml


def deserialize_request(request):
    return pickle.loads(request.body)


def load_config(request):
    return yaml.load(request.body)
