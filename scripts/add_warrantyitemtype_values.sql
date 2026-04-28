DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'warrantyitemtype' AND e.enumlabel = 'WARRANTY'
    ) THEN
        ALTER TYPE warrantyitemtype ADD VALUE 'WARRANTY';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'warrantyitemtype' AND e.enumlabel = 'CERTIFICATE'
    ) THEN
        ALTER TYPE warrantyitemtype ADD VALUE 'CERTIFICATE';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'warrantyitemtype' AND e.enumlabel = 'CONTRACT'
    ) THEN
        ALTER TYPE warrantyitemtype ADD VALUE 'CONTRACT';
    END IF;
END
$$;
