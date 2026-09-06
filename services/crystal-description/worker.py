"""One bounded calculation per process; JSON via stdin/stdout only."""
import contextlib
import io
import json
import sys
from engine import describe_structure, parse_cif, example_structure

def main():
    request=json.loads(sys.stdin.read())
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            mode=request['mode']
            if mode=='example': structure=example_structure()
            elif mode=='cif': structure=parse_cif(request['cif'])
            elif mode=='mp':
                from mp_api.client import MPRester
                with MPRester(request['key'],mute_progress_bars=True) as mpr:
                    structure=mpr.get_structure_by_material_id(request['mpid'])
            else: raise ValueError('Unsupported input')
            result=describe_structure(structure,request['symprec'])
        print(json.dumps({'ok':True,'result':result}))
    except Exception:
        # Do not return library exceptions that may contain an API key or uploaded content.
        print(json.dumps({'ok':False,'error':'Could not analyze this structure. Check the file, site count, order, or MP credentials. / 无法分析，请检查结构文件、位点数、有序性或 MP 凭据。'}))

if __name__=='__main__': main()
