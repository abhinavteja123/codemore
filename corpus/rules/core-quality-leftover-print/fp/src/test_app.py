# FP: test file — print is fine during tests.
def test_thing():
    print("debug from a test")          # exempted (test file basename)


# In a non-test file we'd flag, but this whole file is conftest-shaped.
