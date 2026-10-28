"""backend tests package with shared test isolation.
Ensures tests never call OpenAI or load the real API key.
"""
import os
import sys
import socket
import dotenv
import openai


def _blocked_network(*args, **kwargs):
    raise AssertionError("tests must not call the network")


socket.create_connection = _blocked_network
socket.socket.connect = _blocked_network
socket.socket.connect_ex = _blocked_network
socket.socket.sendto = _blocked_network

# 1. Blank OPENAI_API_KEY in os.environ for the test process before app or dotenv loads.
os.environ['OPENAI_API_KEY'] = ''

# 2. Make sure python-dotenv cannot reload the real key during tests.
_real_load_dotenv = dotenv.load_dotenv


def _safe_load_dotenv(*args, **kwargs):
    kwargs['override'] = False
    res = _real_load_dotenv(*args, **kwargs)
    os.environ['OPENAI_API_KEY'] = ''
    return res


dotenv.load_dotenv = _safe_load_dotenv


class BlockedOpenAIClient:
    """Sentinel OpenAI client that raises AssertionError on any attribute access or call."""

    def __getattr__(self, name):
        raise AssertionError("tests must not call OpenAI")

    def __call__(self, *args, **kwargs):
        raise AssertionError("tests must not call OpenAI")


# Prevent OpenAI constructor from failing or creating a real client during test import
_real_OpenAI = openai.OpenAI
openai.OpenAI = lambda *args, **kwargs: BlockedOpenAIClient()

# Import app and enforce isolation
import app

app.AI_AVAILABLE = False
app.client = BlockedOpenAIClient()

# Restore original constructor so explicit test mocks can instantiate or test if needed
openai.OpenAI = _real_OpenAI
