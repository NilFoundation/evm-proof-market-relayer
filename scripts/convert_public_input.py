import json
import base58
import argparse

def is_uint256(value):
    """Check if the string is a uint256 value in hex."""
    return isinstance(value, str) and value.startswith("0x") and len(value) == 66

def is_hash(value):
    """Check assuming hash values don't start with '0x' and are strings longer than 40 characters."""
    return isinstance(value, str) and not value.startswith("0x") and len(value) > 40

def is_integer_string(value):
    """Check if the string represents an integer."""
    try:
        int(value)
        return True
    except:
        return False
    
def convert_to_uint256(node):
    """Recursively parse a JSON node and convert to uint256."""
    uint256_values = []
    
    if isinstance(node, dict):
        for key, value in node.items():
            uint256_values.extend(convert_to_uint256(value))
    elif isinstance(node, list):
        for item in node:
            uint256_values.extend(convert_to_uint256(item))
    else:
        # Leaf node
        if is_uint256(node):
            uint256_values.append(int(node, 16))
        elif is_hash(node):
            # TODO: 255 or 256?
            uint256_values.append(base58.b58decode_int(node) % (2**256))
        elif is_integer_string(node):
            num = int(node)
            # Encoding the sign and value into two uint256 numbers
            if num < 0:
                uint256_values.append(1)
                uint256_values.append(abs(num))
            else:
                uint256_values.append(0)
                uint256_values.append(num)
        elif isinstance(node, bool):
            uint256_values.append(1 if node else 0)
    
    return uint256_values

def convert_from_uint256(node, uint256_values):
    """Recursively parse an exemplary JSON node and convert from uint256."""
    if isinstance(node, dict):
        new_node = {}
        for key, value in node.items():
            new_node[key], uint256_values = convert_from_uint256(value, uint256_values)
        return new_node, uint256_values
    elif isinstance(node, list):
        new_node = []
        for item in node:
            converted_item, uint256_values = convert_from_uint256(item, uint256_values)
            new_node.append(converted_item)
        return new_node, uint256_values
    else:
        # Leaf node
        if is_uint256(node):
            return "0x{:064x}".format(uint256_values.pop(0)), uint256_values
        elif is_hash(node):
            num = uint256_values.pop(0)
            return base58.b58encode(num.to_bytes(32, byteorder='big')).decode('utf-8'), uint256_values
        elif is_integer_string(node):
            sign_bit = uint256_values.pop(0)
            num = uint256_values.pop(0)
            return str(-num if sign_bit else num), uint256_values
        elif isinstance(node, bool):
            return bool(uint256_values.pop(0)), uint256_values
        else:
            return node, uint256_values
        
def convert_to_array_parser(args):
    with open(args.input) as f:
        input = json.load(f)
    uint256_values = convert_to_uint256(input)
    with open(args.output, "w") as f:
        json.dump(uint256_values, f, indent=4)

def convert_to_json_parser(args):
    with open(args.input) as f:
        uint256_values = json.load(f)
    with open(args.example) as f:
        example = json.load(f)
    output, _ = convert_from_uint256(example, uint256_values)
    with open(args.output, "w") as f:
        json.dump(output, f, indent=4)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        prog='Helper for =nil; Proof Market Endpoint',
        description='Changes format of public input for =nil; Proof Market endpoint')
    parser.add_argument('--input', help="Input file path", default="input.json")
    parser.add_argument('--output', help="Output file path", default="output.json")

    subparsers = parser.add_subparsers(help="sub-command help")
    parser_to_JSON = subparsers.add_parser("from_uint",
                                           help="Conver public input from uint256[] to JSON format")
    parser_to_JSON.add_argument('--example', help="Example public input file path", default="data/example.json")
    parser_to_JSON.set_defaults(func=convert_to_json_parser)

    parser_to_array = subparsers.add_parser("from_json", help="Convert public input from JSON to uint256[]")
    parser_to_array.set_defaults(func=convert_to_array_parser)

    args = parser.parse_args()
    args.func(args)