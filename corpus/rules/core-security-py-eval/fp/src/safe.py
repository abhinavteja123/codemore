import json
import ast

def parse_json(payload):
    return json.loads(payload)

def parse_literal(payload):
    return ast.literal_eval(payload)

# Calling a local function named eval-like is fine.
def evaluator(formula):
    return formula

def go():
    return evaluator('1+1')
