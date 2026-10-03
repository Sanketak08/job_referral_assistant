import os
import smtplib
from email.message import EmailMessage
import mimetypes
from mcp.server.fastmcp import FastMCP

# Initialize the stable v1 MCP Server
mcp = FastMCP("GmailSMTP")

@mcp.tool()
def send_email_with_attachment(to_email: str, subject: str, body: str, attachment_path: str) -> str:
    """
    Sends an email using Gmail with a physical file attachment.
    """
    sender_email = os.environ.get("GMAIL_ADDRESS")
    app_password = os.environ.get("GMAIL_APP_PASSWORD")

    if not sender_email or not app_password:
        return "Error: GMAIL_ADDRESS or GMAIL_APP_PASSWORD missing."

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = sender_email
    msg['To'] = to_email
    msg.set_content(body)

    if os.path.exists(attachment_path):
        ctype, encoding = mimetypes.guess_type(attachment_path)
        if ctype is None or encoding is not None:
            ctype = 'application/octet-stream'
        maintype, subtype = ctype.split('/', 1)

        with open(attachment_path, 'rb') as f:
            msg.add_attachment(f.read(), maintype=maintype, subtype=subtype, filename=os.path.basename(attachment_path))
    else:
        return f"Error: Cannot find resume at {attachment_path}"

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(sender_email, app_password)
            smtp.send_message(msg)
        return f"Successfully sent email to {to_email} with {os.path.basename(attachment_path)} attached."
    except Exception as e:
        return f"Failed to send email: {str(e)}"

if __name__ == "__main__":
    mcp.run()