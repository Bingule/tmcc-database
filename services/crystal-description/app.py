import json
import re
import streamlit as st
from runner import run_request

st.set_page_config(page_title='TMCC | Crystal description', page_icon='💎', layout='centered')
zh = st.radio('Language / 语言', ['中文','English'], horizontal=True) == '中文'
def t(c,e): return c if zh else e
st.title(t('晶体结构描述','Crystal structure description'))
st.caption(t('上传 CIF 或输入 MP 编号，生成可复制的英文结构描述。','Upload a CIF or enter an MP ID to generate an English structure description.'))
mode = st.radio(t('选择输入','Input'), ['SnO₂ '+t('示例','example'), 'CIF', 'Materials Project'], horizontal=True)
file = None
mpid = key = ''
if mode == 'CIF':
    st.caption(t('文件将发送到运行本工具的服务器处理；不主动写入磁盘或共享缓存。','Files are processed on this app’s server; not intentionally saved to disk or shared cache.'))
    file = st.file_uploader(t('上传 CIF（小于 1 MB，最多 100 个位点）','Upload CIF (<1 MB, up to 100 sites)'),type=['cif'])
elif mode == 'Materials Project':
    mpid = st.text_input('Materials Project ID',value='mp-856')
    key = st.text_input('Materials Project API key',type='password',help=t('密钥经本服务发送给 Materials Project 以读取结构，不写入磁盘。','Your key is forwarded by this service to Materials Project to retrieve the structure; not saved to disk.'))
else:
    st.info(t('理想金红石 SnO₂ 教学结构，无需密钥；不是从 MP 实时下载的数据。','Idealized rutile SnO₂ teaching structure; no key required, not a live MP download.'))
with st.expander(t('高级设置','Advanced')):
    symprec=st.number_input(t('对称性容差（Å）','Symmetry tolerance (Å)'),min_value=0.001,max_value=0.1,value=0.01,step=0.001,format='%.3f')
signature=(mode,mpid,file.name if file else None,file.getvalue() if file else None,symprec)
if st.session_state.get('input_signature') != signature:
    st.session_state.pop('result',None)
    st.session_state.input_signature=signature
if st.button(t('生成描述','Generate description'),type='primary'):
    st.session_state.pop('result',None)
    try:
        with st.spinner(t('正在分析结构…','Analyzing structure…')):
            request={'symprec':symprec}
            if mode == 'CIF':
                if file is None: raise ValueError(t('请先上传 CIF。','Upload a CIF first.'))
                if file.size > 1_000_000: raise ValueError(t('文件需小于1 MB。','File must be smaller than 1 MB.'))
                request.update(mode='cif',cif=file.getvalue().decode('utf-8-sig'))
            elif mode == 'Materials Project':
                if not re.fullmatch(r'mp-\d+',mpid.strip()) or not key.strip():
                    raise ValueError(t('请填写有效 MP 编号和 API key。','Enter a valid MP ID and API key.'))
                request.update(mode='mp',mpid=mpid.strip(),key=key.strip())
            else: request.update(mode='example')
            st.session_state.result=run_request(request)
    except ValueError as error: st.error(str(error))
    except Exception: st.error(t('无法分析此结构，请检查 CIF 格式或尝试较小结构。','Unable to analyze this structure. Check the CIF or try a smaller structure.'))
result=st.session_state.get('result')
if result:
    a,b,c=st.columns(3)
    a.metric(t('化学式','Formula'),result['formula'])
    b.metric(t('空间群','Space group'),result['space_group'])
    c.metric(t('位点数','Sites'),result['sites'])
    st.subheader(t('英文结构描述','English description'))
    st.code(result['description'],language=None,wrap_lines=True)
    st.download_button(t('下载文字','Download text'),result['description'],file_name='structure-description.txt')
    st.download_button(t('下载结构摘要 JSON','Download summary JSON'),json.dumps(result,ensure_ascii=False,indent=2),file_name='structure-summary.json')
    with st.expander(t('分析详情与限制','Details and limitations')):
        st.json(result)
st.caption(t('由 Robocrys / pymatgen 计算。配位与键长依赖结构和算法；形式氧化态不等于实验测定价态。','Computed with Robocrys / pymatgen. Coordination and bonds depend on the structure and algorithm; formal oxidation states are not experimental measurements.'))
