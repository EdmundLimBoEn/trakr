package systems.edmundlim.trakr.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelsTest {
    @Test
    fun derivesSchoolRoles() {
        assertEquals(UserRole.TEACHER, RoleDeriver.derive("teacher@sst.edu.sg"))
        assertEquals(UserRole.STUDENT, RoleDeriver.derive("alex@media.ssts.edu.sg"))
    }

    @Test(expected = IllegalStateException::class)
    fun rejectsUnapprovedDomain() {
        RoleDeriver.derive("person@gmail.com")
    }

    @Test
    fun generatesValidBrandedTags() {
        val value = TagCodec.generate()
        assertTrue(value.startsWith("tr:"))
        assertTrue(TagCodec.isValid(value))
        assertFalse(TagCodec.isValid("gg:01J9Z6M4Y7X3N8K2D5P0Q1R4TC"))
    }

    @Test
    fun normalizesHardwareUid() {
        assertEquals("04A1FF", TagCodec.normalizeUid(byteArrayOf(0x04, 0xA1.toByte(), 0xFF.toByte())))
    }
}
