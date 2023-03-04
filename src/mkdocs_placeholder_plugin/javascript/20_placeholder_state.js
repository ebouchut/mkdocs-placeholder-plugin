PlaceholderPlugin.store_checkbox_state = (placeholder_name, new_is_checked) => {
    data = PlaceholderData.checkbox_map[placeholder_name];
    value = new_is_checked ? "checked" : "unchecked";

    // Store the actual placeholder value
    localStorage.setItem(placeholder_name, data[value]);
    // Store whether it is checked in an extra variable
    localStorage.setItem(`${placeholder_name}__STATE__`, value);
}

PlaceholderPlugin.load_checkbox_state = (placeholder_name) => {
    stored_state = localStorage.getItem(`${placeholder_name}__STATE__`)

    if (stored_state == null) {
        // no state is stored, so we check the default value
        data = PlaceholderData.checkbox_map[placeholder_name];
        return data["default_value"]
    } else {
        return stored_state == "checked"
    }
}

PlaceholderPlugin.store_dropdown_state = (placeholder_name, new_index) => {
    data = PlaceholderData.dropdown_map[placeholder_name];

    const new_value_data = data["options"][new_index];
    if (new_value_data){
        // Store the actual placeholder value//@TODO dangerous
        value = new_value_data[1] // 1: value, 0 would be display name
        localStorage.setItem(placeholder_name, value);
        // Store whether it is checked in an extra variable
        localStorage.setItem(`${placeholder_name}__STATE__`, "" + new_index);
    } else {
        console.warn(`Tried to store state '${new_index}' for placeholder ${placeholder_name}, but the only valid names are:`, Object.keys(value["options"]))
    }
}

PlaceholderPlugin.load_dropdown_state = (placeholder_name) => {
    stored_state = localStorage.getItem(`${placeholder_name}__STATE__`)

    data = PlaceholderData.dropdown_map[placeholder_name];
    if (stored_state == null) {
        // no state is stored, so we check the default value
        return data["default_index"]
    } else {
        value = parseInt(stored_state, 10)
        return Math.max(0, Math.min(value, data["options"].length))
    }
}

PlaceholderPlugin.store_textbox_state = (placeholder_name, new_value) => {
    const is_validation_ok = PlaceholderPlugin.is_accepted_for_placeholder(new_value, placeholder_name);
    info(`Set textbox ${placeholder_name} to '${new_value}'. Validation ok? ${is_validation_ok}`);
    if (is_validation_ok) {
        localStorage.setItem(placeholder_name, new_value);
    } else {
        throw new Error(`Validation error: Value '${is_validation_ok}' is not valid for placeholder ${placeholder_name}`);
    }
}

PlaceholderPlugin.load_textbox_state = (placeholder_name) => {
    let value = localStorage.getItem(placeholder_name);
    if (!value) {
        value = PlaceholderPlugin.default_textbox_value(placeholder_name);
    }
    debug(`Read textbox ${placeholder_name}: '${value}'`);
    return value;
}

PlaceholderPlugin.default_textbox_value = (placeholder_name) => {
    let value = PlaceholderData.textbox_map[placeholder_name].value;
    if (value == undefined) {
        const value_fn = PlaceholderData.textbox_map[placeholder_name].value_function;
        try {
            // convert the result to string
            value = `${eval(value_fn)}`;
            debug(`Evaluating value_function: '${value_fn}' -> '${value}'`);
        } catch (error) {
            value = "EVALUATION_ERROR";
            console.error(`Error while evaluating value_function: '${value_fn}'\nError message: ${error}`);
        }
    }
    return value;
}

PlaceholderPlugin.initialize_undefined_placeholders = () => {
    init_count = 0;
    for (let placeholder in PlaceholderData.textbox_map) {
        const value = localStorage.getItem(placeholder)
        if (!value) {
            const new_value = PlaceholderPlugin.load_textbox_state(placeholder);
            localStorage.setItem(placeholder, new_value);
            init_count++;
        } else {
            if (!PlaceholderPlugin.is_accepted_for_placeholder(value, placeholder)) {
                const new_value = PlaceholderPlugin.default_textbox_value(placeholder);
                localStorage.setItem(placeholder, new_value);
                init_count++;
                console.warn(`Placeholder '${placeholder}' had invalid value '${value}'. Replaced with default value '${new_value}'.`);
            }
        }
    }
    for (let placeholder in PlaceholderData.checkbox_map) {
        if (!localStorage.getItem(placeholder)) {
            init_count++;
        }
        // we load and store EVERY item, in case the values for checked and uncheked states have changed since the last visit to the website
        value = PlaceholderPlugin.load_checkbox_state(placeholder);
        PlaceholderPlugin.store_checkbox_state(placeholder, value);
    }
    for (let placeholder in PlaceholderData.dropdown_map) {
        if (!localStorage.getItem(placeholder)) {
            init_count++;
        }
        // we load and store EVERY item, in case the values for checked and uncheked states have changed since the last visit to the website
        // Since we store the index, if the order changes, this will not be handled well
        value = PlaceholderPlugin.load_dropdown_state(placeholder);
        PlaceholderPlugin.store_dropdown_state(placeholder, value);
    }
    if (init_count > 0) {
        log(`Initialized ${init_count} placeholder(s) with default values`);
    }
}
