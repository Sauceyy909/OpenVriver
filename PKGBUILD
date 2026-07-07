# Maintainer: OpenVriver Team <dev@openvriver.org>
pkgname=openvriver-git
pkgver=1.0.0.r0.g8a3fcd
pkgrel=1
pkgdesc="Driver4VR alternative for Linux. Full body tracking with Kinect & Joy-Con/Wiimote VR controller emulation + Virtual HMD mode."
arch=('x86_64' 'aarch64')
url="https://github.com/Sauceyy909/OpenVriver"
license=('GPL3')
depends=('libfreenect' 'bluez' 'bluez-utils' 'steam-vr-generic' 'glu')
makedepends=('git' 'cmake' 'pkg-config')
provides=('openvriver')
conflicts=('openvriver')
source=('git+https://github.com/Sauceyy909/OpenVriver.git'
        '99-openvriver.rules')
sha256sums=('SKIP'
            '9b7245b630e6ef92bc7ee6a666e5f8f8b8e0bf20638ce26da6818126b9117387')

pkgver() {
  cd "$srcdir/${pkgname%-git}"
  git describe --long --tags | sed 's/\([^-]*-\)g/r\1/;s/-/./g'
}

build() {
  cmake -B build -S "$srcdir/${pkgname%-git}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=/usr
  cmake --build build
}

package() {
  DESTDIR="$pkgdir" cmake --install build
  
  # Install udev rules for Kinect & Joycons/Wiimotes
  install -Dm644 "$srcdir/99-openvriver.rules" "$pkgdir/usr/lib/udev/rules.d/99-openvriver.rules"
}
