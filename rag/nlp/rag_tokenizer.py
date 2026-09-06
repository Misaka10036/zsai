#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
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

import logging

import infinity.rag_tokenizer

from common.nltk_setup import ensure_nltk_data

logger = logging.getLogger(__name__)
ensure_nltk_data()


class RagTokenizer(infinity.rag_tokenizer.RagTokenizer):
    def tokenize(self, line: str) -> str:
        from common import settings  # moved from the top of the file to avoid circular import

        if settings.DOC_ENGINE_INFINITY:
            return line
        try:
            return super().tokenize(line)
        except LookupError:
            ensure_nltk_data()
            try:
                return super().tokenize(line)
            except LookupError:
                logger.error("NLTK tokenizer data is missing; falling back to whitespace split")
                return " ".join(str(line or "").split())

    def fine_grained_tokenize(self, tks: str) -> str:
        from common import settings  # moved from the top of the file to avoid circular import

        if settings.DOC_ENGINE_INFINITY:
            return tks
        try:
            return super().fine_grained_tokenize(tks)
        except LookupError:
            ensure_nltk_data()
            try:
                return super().fine_grained_tokenize(tks)
            except LookupError:
                logger.error("NLTK tokenizer data is missing; returning original tokens")
                return tks


def is_chinese(s):
    return infinity.rag_tokenizer.is_chinese(s)


def is_number(s):
    return infinity.rag_tokenizer.is_number(s)


def is_alphabet(s):
    return infinity.rag_tokenizer.is_alphabet(s)


def naive_qie(txt):
    return infinity.rag_tokenizer.naive_qie(txt)


tokenizer = RagTokenizer()
tokenize = tokenizer.tokenize
fine_grained_tokenize = tokenizer.fine_grained_tokenize
tag = tokenizer.tag
freq = tokenizer.freq
tradi2simp = tokenizer._tradi2simp
strQ2B = tokenizer._strQ2B
