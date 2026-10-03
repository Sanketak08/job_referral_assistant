import json
import logging
import time
from typing import Type, TypeVar

from google import genai
from google.genai import errors
from pydantic import BaseModel


T = TypeVar("T", bound=BaseModel)


class GeminiClient:
    def __init__(
        self,
        api_key: str,
        models: dict,
        temperatures: dict,
        max_retries: int = 2,
    ):
        self.client = genai.Client(api_key=api_key)
        self.models = models
        self.temperatures = temperatures
        self.max_retries = max_retries

    def structured(self, task: str, prompt: str, schema: Type[T]) -> T:
        temperature = self.temperatures.get(task, 0.2)

        response = self._generate_content(
            task=task,
            contents=prompt,
            config={
                "temperature": temperature,
                "response_mime_type": "application/json",
                "response_schema": schema,
            },
        )

        # SDK returns text matching the configured schema.
        data = json.loads(response.text)
        return schema.model_validate(data)

    def text(self, task: str, prompt: str) -> str:
        temperature = self.temperatures.get(task, 0.5)

        response = self._generate_content(
            task=task,
            contents=prompt,
            config={"temperature": temperature},
        )
        return response.text.strip()

    def _models_for_task(self, task: str) -> list[str]:
        configured = self.models[task]
        if isinstance(configured, list):
            return configured
        return [configured]

    def _generate_content(self, task: str, contents: str, config: dict):
        last_error = None

        for model in self._models_for_task(task):
            for attempt in range(self.max_retries + 1):
                try:
                    return self.client.models.generate_content(
                        model=model,
                        contents=contents,
                        config=config,
                    )
                except errors.ServerError as exc:
                    last_error = exc
                    if attempt >= self.max_retries:
                        logging.warning(
                            "Gemini model %s failed for task %s; trying fallback.",

                            task,
                        )
                        break
                    sleep_seconds = 2 ** attempt
                    logging.warning(
                        "Gemini model %s is unavailable for task %s; "
                        "retrying in %ss.",
                        model,
                        task,
                        sleep_seconds,
                    )
                    time.sleep(sleep_seconds)
                except errors.ClientError as exc:
                    last_error = exc
                    if not self._is_fallback_client_error(exc):
                        raise
                    logging.warning(
                        "Gemini model %s is not usable for task %s; "
                        "trying fallback.",
                        model,
                        task,
                    )
                    break

        raise last_error

    @staticmethod
    def _is_fallback_client_error(exc: errors.ClientError) -> bool:
        error_text = str(exc)
        return any(
            marker in error_text
            for marker in [
                "404 NOT_FOUND",
                "429 RESOURCE_EXHAUSTED",
                "RESOURCE_EXHAUSTED",
                "UNAVAILABLE",
            ]
        )
