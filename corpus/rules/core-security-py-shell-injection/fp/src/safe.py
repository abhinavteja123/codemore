import subprocess

def argv_form(rev):
    return subprocess.run(['git', 'log', '--oneline', rev], check=True)

def explicit_no_shell(cmd_argv):
    return subprocess.Popen(cmd_argv, shell=False)

# Static string to os.system — flagged in theory but we deliberately
# don't pursue static commands; the rule fires on DYNAMIC strings only.
import os
def static_os_system():
    return os.system('ls')

# subprocess.run with kwargs other than shell=True — silent.
def with_check(rev):
    return subprocess.run(['git', 'log', rev], check=True, capture_output=True)
