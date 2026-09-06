#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#

"""Shared setup for RAGFlow unit tests.

Several parsers and the chunking pipeline tokenize text with NLTK, which needs
the ``punkt_tab`` and ``wordnet`` data sets. Production provisions these via
``download_deps.py`` (into ``nltk_data``, exported as ``NLTK_DATA`` by
``docker/launch_backend_service.sh``) and ``api.validation`` at startup, but the
unit-test runner has neither. Without the data, tokenizer-backed tests such as
``test_epub_parser`` and ``test_dataflow_service`` fail with
``LookupError: Resource 'punkt_tab' not found``. Make sure the data is reachable
before any test imports a tokenizer: reuse a provisioned ``nltk_data`` directory
when present, and download only what is still missing.
"""

from common.nltk_setup import ensure_nltk_data

ensure_nltk_data()
