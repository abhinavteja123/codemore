import logging

logger = logging.getLogger(__name__)


def log_config(api_key, access_token, session_id):
    logger.info('api_key=' + api_key)              # ← flag (concat with secret-named ident)
    logger.error({'apiKey': api_key})              # ← flag (dict-key)
    logger.warning(f'token={access_token}')        # ← flag (f-string)
    print('the password is', api_key)              # ← flag (print + identifier)
    logger.info(session_id)                         # ← flag (identifier)
