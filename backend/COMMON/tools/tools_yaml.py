# ◆—< Pack >—————————————————————————————————◆ Python
from typing import Any, Optional, Dict
import yaml


# ■—< CLS >———————————————————————————————————————————————————————————————————————————■  YAML Configuration
class YamlConfig:
    """
    Read YAML configuration files through a configparser-like interface.

    Load the file at initialization and retrieve cached values with get().
    Call reload() to refresh the configuration from disk.

                                                                                                  ♂ Wilson 2025.02.07
    """

    def __init__(self, file: str, mode: str = 'r', encoding: str = 'utf-8') -> None:
        """
        Initialize the reader and load the configuration into memory.

        :param file: Path to the configuration file. The '.yaml' suffix is appended
                     if it is not already present.
        :param mode: File mode passed to open(); defaults to text reading ('r').
        :param encoding: Text encoding used to read the file; defaults to 'utf-8'.
        :return: None.
        :raises ValueError: If the YAML cannot be parsed or the file mode is invalid.
        :raises OSError: If file access fails for a reason other than a missing file.
        """
        # Append '.yaml' when the supplied path does not end with that suffix.
        if not file.endswith('.yaml'):
            file += '.yaml'
        self.file = file
        self.mode = mode
        self.encoding = encoding
        self._data: Dict[str, Any] = self._load()

    def __repr__(self) -> str:
        """
        Return a diagnostic representation of the configuration reader.

        :return: A string containing the file path and all cached configuration values.
        """
        return f"<YamlConfig file='{self.file}' data={self._data}>"

    def _load(self) -> Dict[str, Any]:
        """
        Read and parse the YAML configuration file.

        A missing file or a falsy parsed value produces an empty dictionary.
        The document is expected to be a mapping, but its structure is not validated.

        :return: The parsed YAML document, or an empty dictionary as described above.
        :raises ValueError: If YAML parsing fails.
        :raises OSError: If file access fails for a reason other than a missing file.
        """
        try:
            with open(self.file, self.mode, encoding=self.encoding) as f:
                # Replace a falsy parsed value with an empty dictionary.
                data = yaml.safe_load(f) or {}
                return data
        except FileNotFoundError:
            # Treat a missing file as an empty configuration.
            return {}
        except yaml.YAMLError as e:
            raise ValueError(f"Error parsing YAML file {self.file}: {e}")

    def get(self, section: str, option: Optional[str] = None, fallback: Any = None) -> Any:
        """
        Retrieve a section or an option from the cached configuration.

        :param section: Top-level configuration key to look up.
        :param option: Key within the section. None returns the entire section.
        :param fallback: Value returned when the section is missing or null, the
                         option is missing, or an option is requested from a
                         section that is not a mapping.
        :return: The requested section, option value, or fallback. An explicitly
                 null option is returned as None rather than replaced by fallback.
        """
        section_data = self._data.get(section)
        if section_data is None:
            """
            Return fallback when the section is missing or null.
            """
            return fallback

        if option is None:
            """
            Return the entire section when no option is requested.
            """
            return section_data

        if isinstance(section_data, dict):
            """
            Look up the option in the section mapping, using fallback for a missing key.
            """
            return section_data.get(option, fallback)
        return fallback

    def reload(self) -> None:
        """
        Reload the file and replace the cached configuration.

        A missing file clears the cache to an empty dictionary. If loading raises
        an exception, the previous cached value is retained.

        :return: None.
        :raises ValueError: If YAML parsing fails.
        :raises OSError: If file access fails for a reason other than a missing file.
        """
        self._data = self._load()
