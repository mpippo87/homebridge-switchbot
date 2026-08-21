import { describe, expect, it, vi } from 'vitest'

import { getDeviceCommandHandler } from '../../src/deviceCommandMapper'
import { RollerShadeDevice } from '../../src/devices/genericDevice'

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

describe('curtain hold position', () => {
  it('should expose HomeKit HoldPosition for Roller Shade and send pause', async () => {
    const client = { setDeviceState: vi.fn().mockResolvedValue({ status: 'success' }) }
    const rollerShade = new RollerShadeDevice(
      { id: 'shade1', type: 'Roller Shade', log: mockLogger },
      { _client: client, blePollingEnabled: false, log: mockLogger } as any,
    )

    const accessory = rollerShade.createHAPAccessory({})
    const windowCovering = accessory.services.find((service: any) => service.type === 'WindowCovering')

    expect(windowCovering.characteristics.HoldPosition).toBeDefined()

    await windowCovering.characteristics.HoldPosition.set()

    expect(client.setDeviceState).toHaveBeenCalledWith('shade1', {
      command: 'pause',
      parameter: 'default',
      commandType: 'command',
    })
  })

  it('should route Roller Shade pause commands to the device pause method', async () => {
    const pause = vi.fn().mockResolvedValue({ status: 'success' })
    const handler = getDeviceCommandHandler('roller shade', 'pause')

    await handler?.({ pause }, {})

    expect(pause).toHaveBeenCalledOnce()
  })
})
