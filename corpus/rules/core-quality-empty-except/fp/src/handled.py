# FP: except clauses that log, re-raise, or do real work.

import logging

logger = logging.getLogger(__name__)

def with_log(path):
    try:
        return open(path).read()
    except Exception as e:
        logger.exception('read failed: %s', e)
        raise

def fallback(s):
    try:
        return int(s)
    except ValueError:
        return 0

def reraise():
    try:
        thing()
    except KeyError:
        raise RuntimeError('promoted')

def thing(): pass
