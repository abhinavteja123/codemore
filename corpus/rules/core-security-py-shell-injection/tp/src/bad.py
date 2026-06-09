import subprocess
import os

def with_shell_true(rev):
    return subprocess.run(f'git log --oneline {rev}', shell=True)   # ← flag

def os_system(cmd):
    return os.system('rm -rf ' + cmd)                                # ← flag

def os_system_fstring(target):
    return os.system(f'curl {target}')                               # ← flag

def get_output(name):
    return subprocess.getoutput('echo ' + name)                      # ← flag (legacy method)
