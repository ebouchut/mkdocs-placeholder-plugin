import { parse_config, PluginConfig } from "./parse_settings";
import { init_logging, logger } from "./debug";
import { replace_placeholders_in_subtree } from "./replacer";
import { initialize_input_fields } from "./inputs";

export const main = () => {
    const config = parse_config((window as any).PlaceholderPluginConfigJson);
    
    init_logging(config.settings.debug);
    logger.info("PluginConfig", config);

    const delay_millis = config.settings.delay_millis;
    
    // Then do the placeholder replacing at the user-specified time
    if (delay_millis < 0) {
        // For values smaller than 0, immediately do the replacements
        do_plugin_stuff(config);
    } else if (delay_millis == 0) {
        // Replace placeholders as soon as the page finished loading
        window.addEventListener("load", () => do_plugin_stuff(config));
    } else {
        // Wait the amount of millis specified by the user
        window.addEventListener("load", () => {
            setTimeout(() => do_plugin_stuff(config), delay_millis);
        });
    }
}

const do_plugin_stuff = (config: PluginConfig) => {
    replace_placeholders_in_subtree(document.body, config);

    initialize_input_fields(config);

    // PlaceholderPlugin.initialize_auto_tables(used_placeholders); //@TODO
}

