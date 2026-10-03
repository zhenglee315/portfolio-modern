# ◆—< Pack >—————————————————————————————————◆ Python
from pathlib import Path
import importlib.util


# ■—< FUNC >——————————————————————————————————————————————————————————————————————————■ SocketIO - Includer
def socketio_include_events(dir_app: str = None, file_pattern: str = 'events') -> None:
    """
    Recursively search for Python files within the specified base directory whose filenames contain the specified file pattern
    (default is 'events', e.g., 'chat_events.py'), and import those modules so that their socket event definitions get registered.

    If dir_app is not provided, the current working directory (assumed as the project root) will be used to search for matching files.

    :param dir_app: The base directory to search for socket event modules. If None, the entire project is searched.
    :param file_pattern: A substring pattern to match in filenames. Files containing this pattern will be processed.
                                                                                                  ♂ Wilson 2025.03.14
    """
    base_path = Path(dir_app) if dir_app else Path('.')

    for py_file in base_path.rglob(f"{file_pattern}*.py"):
        """
        Use rglob to recursively iterate over all Python files in base_dir and its subdirectories.
        The pattern f"*{file_pattern}*.py" matches any file whose name contains the specified file_pattern.
        """

        # Construct a module name by taking the file's path relative to base_path,
        # removing the .py extension, and replacing path separators with dots.
        module_rel = py_file.relative_to(base_path).with_suffix("")
        module_name = ".".join(module_rel.parts)

        # Create a module specification from the file location and load the module dynamically.
        spec = importlib.util.spec_from_file_location(module_name, py_file)
        if spec is None or spec.loader is None:
            continue
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
