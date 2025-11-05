"""Text processing helpers used across the application."""


def normalize_email(email: str) -> str:
    """Return a canonical representation for email addresses.

    The authentication flow should not depend on the input casing or the
    presence of accidental leading/trailing whitespace.  E-mail local parts are
    case-sensitive in theory but almost all providers treat them
    case-insensitively, therefore we fold everything to lower-case for
    consistency.
    """

    return email.strip().casefold()


__all__ = ["normalize_email"]
