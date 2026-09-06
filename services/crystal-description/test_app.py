from streamlit.testing.v1 import AppTest

app = AppTest.from_file('app.py', default_timeout=180).run()
assert not app.exception, app.exception
app.button[0].click().run()
assert not app.exception, app.exception
assert app.metric[0].value == 'SnO2'
assert app.metric[1].value == 'P4_2/mnm'
assert 'octahedra' in app.code[0].value
app.radio[1].set_value('Materials Project').run()
assert len(app.metric) == 0, 'Old results must be cleared when input changes'
app.button[0].click().run()
assert len(app.error) == 1 and not app.exception
print('PASS: example calculation, summary, description, stale-result clearing, missing-key validation')
