def format_date(timestamp):
    """Format a timestamp into a readable date string."""
    from datetime import datetime
    return datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')

def parse_json(data):
    """Parse JSON data with error handling."""
    import json
    try:
        return json.loads(data)
    except json.JSONDecodeError:
        return None