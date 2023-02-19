from enum import Enum, auto
import os
import re
from typing import NamedTuple, Any, Optional
# pip packages
from mkdocs.exceptions import PluginError
import yaml
# local
from . import warning
from .validators import VALIDATOR_PRESETS, Validator

# Should only contain letters, numbers, and underscores (hopefully prevents them from being broken up by syntax highlighting)
# Should not begin with a number (this prevents placeholders like `1`)
# Should not begin or end with a underscore (they are reserved for internal purposes like state tracking)
VARIABLE_NAME_REGEX = re.compile("^[A-Z]([A-Z0-9_]*[A-Z0-9])?$")
# The types to accept for fields, where a string is accepted
TYPES_PRIMITIVE = [bool, float, int, str]


class InputType(Enum):
    Field = auto()
    Checkbox = auto()
    Dropdown = auto()

class Placeholder(NamedTuple):
    """
    Stores information parsed from the placeholder file.
    """
    # The name of the placeholder. For example "TEST"
    name: str
    # The default value of the placeholder. For example "123"
    default_value: str
    # A javascript snippet to generate the default value
    default_function: str
    # The description to show when generating the input table
    description: str
    # Whether the placeholder should be protected from users editing it.
    # Use true to have hidden convenience variables. Example "COMB_EMAIL: xCOMB_FIRST_NAMEx.xCOMB_SURNAMEx@xCOMB_DOMAINx"
    read_only: bool
    # Whether to only replace visible text or to try to replace it anywhere in the DOM
    replace_everywhere: bool
    # For supporting advanced input fields such as dropdown menus and checkboxes
    values: dict[str,str]
    # The type is not specified directly by the user, but is instead determined from the `values` field.
    # It is stored here for internal use
    input_type: InputType
    # The input must conform to one of the validators. This allows mixed input such as "IPv4 address or IPv6 address or Hostname"
    validator_list: list[Validator]


def load_placeholder_data(path: str) -> dict[str, Placeholder]:
    """
    Load placeholder data from a file and run some checks on the parsed contents
    """
    if os.path.exists(path):
        with open(path, "rb") as f:
            data = yaml.safe_load(f)

        placeholders: dict[str,Placeholder] = {}
        
        if type(data) != dict:
            raise PluginError(f"[placeholder] Config file error: Expected root element of type 'dict', but got '{type(data).__name__}'")
        for key, value in data.items():
            # Make sure that values are strings (or convert them to strings if possible)
            if isinstance(value, dict):
                # New style entry with attributes
                # debug(f"dict: {value}")
                placeholders[key] = parse_placeholder_dict(key, value)
            elif type(value) in TYPES_PRIMITIVE:
                # Old config style, will only set name and default_value
                # For consistency's sake, we also parse it wit the parse_palceholder_dict() function
                # debug(f"primitive: {value}")
                placeholders[key] = parse_placeholder_dict(key, {"default": value})
            else:
                raise PluginError(f"Expected a single value or object for key '{key}', but got type {type(value).__name__}")
            
            # Check that the variable name matches expected format
            if not VARIABLE_NAME_REGEX.match(key):
                warning(f"Potentially problematic variable name: '{key}'. A valid name should only contain capital letters and underscores.")
        
        return placeholders
    else:
        raise PluginError(f"Placeholder data file '{path}' does not exist")


def parse_placeholder_dict(name: str, data: dict[str,Any]) -> Placeholder:
    """
    Parse a dictionary that contains the information for a single placeholder.
    """

    # Readonly is optional, defaults to False
    read_only = data.get("read_only", False)
    if type(read_only) != bool:
        raise PluginError(f"Wrong type for key 'read_only' in placeholder '{name}': Expected 'bool', got '{type(read_only).__name__}'")

    # Replace-everywhere is optional, defaults to False
    replace_everywhere = data.get("replace_everywhere", False)
    if type(replace_everywhere) != bool:
        raise PluginError(f"Wrong type for key 'replace_everywhere' in placeholder '{name}': Expected 'bool', got '{type(replace_everywhere).__name__}'")

    # Description is optional
    description = str(data.get("description", ""))

    # Values are optional
    values_original: dict = data.get("values", {})
    values: dict[str,str] = {}
    for key, value in values_original.items():
        if type(value) in TYPES_PRIMITIVE:
            values[str(key)] = str(value)
        else:
            raise PluginError(f"Type error in placeholder '{name}', field 'values': Expected a dictionary with primitive values, but got {value} ({type(value).__name__}) in key {key}")


    # default (default_value) is required, unless values or default_function exists
    default_function = str(data.get("default-function", ""))
    try:
        default_value = str(data["default"])
        if default_function:
            raise PluginError(f"Both 'default' and 'default-function' are defined in placeholder '{name}'")
    except KeyError:
        default_value = ""
        if not default_function and not values:
            raise PluginError(f"Missing key 'default' or 'default-function' in placeholder '{name}'")

    # Determine the type, and do some extra type dependent validation
    if values:
        if set(values.keys()) == {"checked", "unchecked"}:
            input_type = InputType.Checkbox
            if default_value not in ["", "checked", "unchecked"]:
                raise PluginError(f"Type error in placeholder '{name}', field 'default': Allowed values for check boxes are '' (empty string), 'checked', 'unchecked'")
        else:
            input_type = InputType.Dropdown
            if default_value != "" and default_value not in values.keys():
                raise PluginError(f"Type error in placeholder '{name}', field 'default': Allowed values for a dropdown box are '' (empty string), or one of the keys defined in the 'values' field")
    else:
        input_type = InputType.Field

    # Validators only exist for textboxes:
    validator_list = []
    if input_type == InputType.Field:
        if "validators" in data:
            validators = data["validators"]
            if type(validators) == str:
                validator_data_list = [validators]
            elif type(validators) == list:
                validator_data_list = validators
            else:
                raise PluginError(f"Type error in placeholder '{name}', field 'validators': Should be either a string or a list, but is type {type(validators).__name__}")
            
            for validator in validator_data_list:
                if type(validator) == str:
                    # This is a validator preset
                    validation_preset = VALIDATOR_PRESETS.get(validator)
                    if validation_preset:
                        validator_list.append(validation_preset)
                        check_if_matches_validator(validation_preset, default_value, print_warnings=True, raise_exception_on_error=True)
                    else:
                        raise PluginError(f"No validator preset named '{validation_preset}', valid values are: {', '.join(VALIDATOR_PRESETS)}")
                else:
                    raise PluginError("Custom validators not implemented yet")

    return Placeholder(
        name=name,
        default_value=default_value,
        default_function=default_function,
        description=description,
        replace_everywhere=replace_everywhere,
        read_only=read_only,
        values=values,
        input_type=input_type,
        validator_list=validator_list,
    )


def check_if_matches_validator(validator: Validator, default_value: str, print_warnings: bool = False, raise_exception_on_error: bool = False) -> bool:
    has_error = False
    is_match = True
    for rule in validator.rules:
        try:
            matches = bool(re.search(rule.regex_string, default_value))
        except Exception as ex:
            raise PluginError(f"Error in regular expression '{rule.regex_string}': {ex}")
        if matches != rule.should_match:
            # This rule fails
            is_match = False
            if rule.severity == "error":
                has_error = True
            if print_warnings:
                warning(f"[Validation {rule.severity}] '{default_value}' does not match validator '{validator.name}': {rule.error_message}")

    if has_error and raise_exception_on_error:
        raise PluginError(f"'{default_value}' does not match validator '{validator.name}'")

    return is_match
