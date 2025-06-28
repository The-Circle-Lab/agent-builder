import os
import yaml
import re
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Load config from yaml file
def load_config():
    config_path = Path("config.yaml")
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")
    
    with open(config_path, 'r') as f:
        raw_config = f.read()
    
    # Substitute environment variables
    pattern = r'\$\{([^}:]+)(?::([^}]*))?\}'
    def replace_var(match):
        var_name = match.group(1)
        default_value = match.group(2) if match.group(2) is not None else ""
        return os.getenv(var_name, default_value)
    
    substituted_config = re.sub(pattern, replace_var, raw_config)
    return yaml.safe_load(substituted_config) 
