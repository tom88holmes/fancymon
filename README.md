# FancyMon - Serial Monitor

A powerful and feature-rich serial monitor extension for Visual Studio Code with advanced filtering, real-time plotting, and data visualization capabilities.

## Features

### Core Serial Monitoring
- **Real-time Serial Communication**: Connect to any serial port with configurable baud rates (up to 2Mbps), data bits, stop bits, and parity settings
- **ANSI Color Support**: Full support for ANSI escape codes with proper color rendering
- **Auto-scroll**: Automatically follows incoming data with smart scroll position management
- **High Performance**: Optimized rendering engine that handles thousands of lines efficiently

### Advanced Filtering
- **Real-time Filtering**: Filter lines by pattern matching as you type
- **Copy Options**: Copy all lines, filtered lines, or visible lines to clipboard
- **Configurable Buffer**: Adjustable maximum line count (100 to 1,000,000 lines)

### Data Visualization & Plotting
- **Real-time Plotting**: Extract numeric values from serial data and plot them in real-time
- **Multiple Variables**: Track and plot multiple variables simultaneously
- **Custom Patterns**: Use regex patterns to extract values from serial lines
- **Time-based X-axis**: Extract time/uptime values for time-series plotting
- **Interactive Charts**: Powered by Chart.js with zoom, pan, and legend support

### Additional Features
- **Save to File**: Export serial data to a file
- **Device Reset**: Send reset pulses via DTR/RTS control lines
- **RTS/DTR Control**: Properly configured to avoid interfering with shared pins (e.g., BOOT0/SDA)
- **Frozen View**: Scroll up to review old data without losing your position
- **Line Usage Indicator**: Monitor buffer usage in real-time

## Requirements

- Visual Studio Code 1.99.0 or higher (compatible with Cursor)
- A serial port (USB-to-Serial adapter, built-in serial port, etc.)

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Run the command: **"FancyMon: Start Serial Monitor"**
3. Select your serial port from the dropdown
4. Configure baud rate and other serial settings
5. Click **"Connect"** to start monitoring

### Plotting Data

1. Switch to the **"Plot"** tab
2. Enter a sample line from your serial output in the "Pattern Input" field
3. The extension will automatically extract numbers from the line
4. Select which numbers you want to plot
5. Click **"Add Variable to Plot"**
6. The extension will automatically extract matching values from incoming serial data and plot them in real-time

### Filtering Lines

Type a pattern in the **"Filter"** input field to show only lines matching that pattern. The filter works in real-time as you type.

## Extension Settings

This extension does not currently add any VS Code settings. All configuration is done through the serial monitor interface.

## Known Issues

None at this time. If you encounter any issues, please report them on the extension's GitHub repository.

## Release Notes

### 0.0.4

Major feature update bringing advanced debugging and plotting capabilities:
- **Enhanced Plotting**: Switched to Plotly.js for more interactive and powerful real-time plotting with zoom, pan, and better performance.
- **ELF Address Resolution**: Automatically resolves hex addresses (e.g., stack traces) to function names, file paths, and line numbers using `addr2line`.
- **Toolchain Auto-discovery**: Automatically detects ESP-IDF toolchain paths for symbol resolution without manual configuration.
- **Filter History**: Added persistent history dropdowns for "Include" and "Exclude" filters with smart debouncing (saved after 5 seconds).
- **UI Improvements**: Optimized control layout and filter input responsiveness.

### 0.0.2

- **Architecture Update**: Extension now runs in the UI process for better Webview compatibility.
- **Serial Communication**: Reverted to native `serialport` for improved reliability and performance compared to Web Serial API.
- **Bug Fixes**: Addressed issues with port listing and connection stability.

### 0.0.1

Initial release of FancyMon Serial Monitor with:
- Serial port communication
- Real-time data display with ANSI color support
- Advanced filtering capabilities
- Real-time data plotting and visualization
- High-performance rendering for large data streams
- Proper RTS/DTR control to avoid pin conflicts

---

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

See the LICENSE file for details.
