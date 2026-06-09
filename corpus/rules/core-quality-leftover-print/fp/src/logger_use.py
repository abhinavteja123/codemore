# FP: uses a structured logger instead of print.
import logging

logger = logging.getLogger(__name__)

def setup():
    logger.info("server starting")

def cleanup():
    logger.info("server stopping")
