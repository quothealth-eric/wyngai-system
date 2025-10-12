-- Function to execute arbitrary SQL (for admin use only)
-- This allows our setup endpoints to execute schema SQL files

CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER -- Run with elevated privileges
AS $$
BEGIN
  EXECUTE sql_query;
  RETURN 'SQL executed successfully';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'Error: ' || SQLERRM;
END;
$$;

-- Grant permission to service role only
REVOKE ALL ON FUNCTION exec_sql(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;