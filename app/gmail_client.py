from pathlib import Path
from email.mime.text import MIMEText
import base64

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build


SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


class GmailClient:
    def __init__(
        self,
        credentials_path: str = "./data/gmail_credentials.json",
        token_path: str = "./data/gmail_token.json",
    ):
        self.credentials_path = Path(credentials_path)
        self.token_path = Path(token_path)
        self.service = self._build_service()

    def _build_service(self):
        creds = None

        if self.token_path.exists():
            creds = Credentials.from_authorized_user_file(
                str(self.token_path), SCOPES
            )

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                if not self.credentials_path.exists():
                    raise FileNotFoundError(
                        f"Missing Gmail OAuth credentials: {self.credentials_path}"
                    )

                flow = InstalledAppFlow.from_client_secrets_file(
                    str(self.credentials_path), SCOPES
                )
                creds = flow.run_local_server(port=0)

            self.token_path.write_text(creds.to_json(), encoding="utf-8")

        return build("gmail", "v1", credentials=creds)

    def send(self, to: str, subject: str, body: str) -> str:
        message = MIMEText(body, "plain", "utf-8")
        message["to"] = to
        message["subject"] = subject

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

        sent = (
            self.service.users()
            .messages()
            .send(userId="me", body={"raw": raw})
            .execute()
        )
        return sent["id"]
