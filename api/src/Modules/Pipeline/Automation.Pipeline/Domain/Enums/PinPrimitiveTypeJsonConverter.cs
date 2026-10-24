using System.Text.Json;
using System.Text.Json.Serialization;

namespace Automation.Pipeline.Domain.Enums;

public class PinPrimitiveTypeJsonConverter : JsonConverter<PinPrimitiveType>
{
    public override PinPrimitiveType Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options
    )
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString();
            if (string.Equals(str, "Path", StringComparison.OrdinalIgnoreCase))
            {
                return PinPrimitiveType.String;
            }

            if (Enum.TryParse<PinPrimitiveType>(str, ignoreCase: true, out var result))
            {
                return result;
            }
        }
        else if (reader.TokenType == JsonTokenType.Number)
        {
            var intVal = reader.GetInt32();
            if (intVal == 3) // Legacy integer for 'Path'
            {
                return PinPrimitiveType.String;
            }

            if (Enum.IsDefined(typeof(PinPrimitiveType), intVal))
            {
                return (PinPrimitiveType)intVal;
            }
        }

        return PinPrimitiveType.String;
    }

    public override void Write(
        Utf8JsonWriter writer,
        PinPrimitiveType value,
        JsonSerializerOptions options
    )
    {
        writer.WriteStringValue(value.ToString());
    }
}
