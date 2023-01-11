import json
import os
# local
from .plugin_config import PlaceholderPluginConfig
from .placeholder_data import Placeholder, InputType


def copy_assets_to_mkdocs_site_directory(site_dir: str, plugin_config: PlaceholderPluginConfig, placeholders: dict[str, Placeholder]):
    """
    Copy the JavaScript file to the site (if necessary) and replace the placeholder string with the actual data
    """
    custom_js_path = os.path.join(site_dir, plugin_config.placeholder_js)
    if os.path.exists(custom_js_path):
        # use the file that is already in the site directory
        input_file = custom_js_path
    else:
        # use the default file supplied by the plugin
        input_file = get_resource_path("placeholder-plugin.js")
    
    # Read the text from the input file
    with open(input_file, "r") as f:
        text = f.read()

    # Generate placeholder data and inject them in the JavaScript file
    placeholder_data_json = generate_placeholder_json(placeholders, plugin_config)
    text = text.replace("__MKDOCS_PLACEHOLDER_PLUGIN_JSON__", placeholder_data_json)

    # write back the results
    parent_dir = os.path.dirname(custom_js_path)
    os.makedirs(parent_dir, exist_ok=True)
    with open(custom_js_path, "w") as f:
        f.write(text)


def get_resource_path(name: str) -> str:
    """
    Gets the path to a file in the same directory as this file
    """
    current_dir = os.path.dirname(__file__)
    return os.path.join(current_dir, name)


def generate_placeholder_json(placeholders: dict[str, Placeholder], plugin_config: PlaceholderPluginConfig) -> str:
    """
    Generate the JSON string, that will replace the placeholder in the JavaScript file
    """
    checkbox_data = {}
    dropdown_data = {}
    textbox_data = {}

    for placeholder in placeholders.values():
        if placeholder.input_type == InputType.Checkbox:
            checkbox_data[placeholder.name] = {
                "default_value": bool(placeholder.default_value == "checked"),
                "checked": placeholder.values["checked"],
                "unchecked": placeholder.values["unchecked"],
                "read_only": placeholder.read_only,
            }
        elif placeholder.input_type == InputType.Dropdown:
            # Figure out the index of the item selected by default
            default_index = 0
            for index, value in enumerate(placeholder.values.keys()):
                if placeholder.default_value == value:
                    default_index = index

            dropdown_data[placeholder.name] = {
                "default_index": default_index,
                "options": [[key, value] for key, value in placeholder.values.items()],
                "read_only": placeholder.read_only,
            }
        elif placeholder.input_type == InputType.Field:
            textbox_data[placeholder.name] = {
                "value": placeholder.default_value,
                "read_only": placeholder.read_only,
            }
        else:
            raise Exception(f"Unexpected input type: {placeholder.input_type}")

    descriptions = {p.name: p.description for p in placeholders.values()}

    result_object = {
        "checkbox": checkbox_data,
        "dropdown": dropdown_data,
        "descriptions": descriptions,
        "textbox": textbox_data,
        "delay_millis": plugin_config.replace_delay_millis,
        "reload": plugin_config.reload_on_change,
        "debug": plugin_config.debug_javascript,
    }
    return json.dumps(result_object, indent=None, sort_keys=False)
