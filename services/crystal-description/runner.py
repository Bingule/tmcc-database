import json
import subprocess
import sys
import threading
from pathlib import Path

_slot=threading.BoundedSemaphore(1)

def run_request(request,timeout=90):
    if not _slot.acquire(blocking=False):
        raise ValueError('Another calculation is running; please try again shortly. / 正在处理其他计算，请稍后再试。')
    try:
        try:
            process=subprocess.run([sys.executable,'-X','utf8',str(Path(__file__).with_name('worker.py'))],
                input=json.dumps(request),capture_output=True,text=True,encoding='utf-8',timeout=timeout)
        except subprocess.TimeoutExpired:
            raise ValueError('Calculation timed out after 90 seconds. Try a smaller cell. / 计算超过90秒，请尝试更小的晶胞。') from None
        if process.returncode:
            raise ValueError('Calculation failed. / 计算失败，请尝试其他结构。')
        result=json.loads(process.stdout)
        if not result['ok']: raise ValueError(result['error'])
        return result['result']
    finally:
        _slot.release()
