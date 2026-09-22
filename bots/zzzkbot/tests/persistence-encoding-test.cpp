// Standalone regression test for the ShieldBattery ZZZKBot persistence patch.
// Compile with the prepared source directory on the include path.
#include "PersistenceEncoding.h"

#include <cassert>
#include <string>

int main()
{
    using ZZZKBotPersistence::encodeFilenameComponent;
    using ZZZKBotPersistence::escapeHistoryField;

    assert(encodeFilenameComponent("Chris Coxe-1.7") == "Chris Coxe-1.7");
    assert(
        encodeFilenameComponent("self/..\\opponent%:\t\n") ==
        "self%2F..%5Copponent%25%3A%09%0A");
    assert(encodeFilenameComponent("CON") == "%43ON");
    assert(encodeFilenameComponent("con.ext") == "%63on.ext");
    assert(encodeFilenameComponent("LPT1") == "%4CPT1");
    assert(encodeFilenameComponent("CON ") == "%43ON ");
    assert(encodeFilenameComponent("A%2F") == "A%252F");
    assert(encodeFilenameComponent("A%2F") != encodeFilenameComponent("A/"));
    assert(encodeFilenameComponent("\xE2\x98\x83") == "%E2%98%83");

    const std::string recordValue("name\tline\r\n%\0", 13);
    const std::string escaped = escapeHistoryField(recordValue);
    assert(escaped == "name%09line%0D%0A%25%00");
    assert(escaped.find('\t') == std::string::npos);
    assert(escaped.find('\r') == std::string::npos);
    assert(escaped.find('\n') == std::string::npos);
}
