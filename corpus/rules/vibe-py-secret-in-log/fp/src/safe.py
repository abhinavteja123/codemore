import logging

logger = logging.getLogger(__name__)


def redact(v): return '***'
def mask(v): return '***'


def log_safe():
    logger.info('startup complete')                  # no secret-shaped name
    logger.info({'count': 42, 'name': 'demo'})       # benign dict keys
    logger.warning('error', extra={'request_id': 'abc'})


def log_redacted(api_key, access_token):
    logger.info({'apiKey': redact(api_key)})         # wrapped — silent
    logger.error('token=' + mask(access_token))      # wrapped — silent


# Non-logger functions with secret-named args are NOT flagged.
def use_api_key(api_key):
    return f'Bearer {api_key}'
